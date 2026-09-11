-- 0003_rbac
--
-- Roles, permissions, and the helper functions every RLS policy is built on.
--
-- Two rules govern everything below:
--
--  1. Policies test PERMISSIONS, never role names. `has_permission('x')`, never
--     `role = 'hr'`. Roles are data; a user may hold several, and their
--     effective permissions are the union — scopes add, never cancel.
--
--  2. The helpers read JWT claims rather than joining user_roles on every row.
--     A custom access token hook stamps the claims at sign-in; policies stay
--     index-friendly instead of running a subquery per row.

create table permissions (
  slug        text primary key,
  module      text not null,
  description text not null
);

comment on table permissions is
  'The permission vocabulary. Global, not per-tenant: every organization draws '
  'from the same set so a policy means the same thing everywhere.';

-- Roles are per-tenant so an organization can rename or add its own, while the
-- five seeded slugs stay stable for the code that references them.
create table roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  slug            text not null check (slug ~ '^[a-z][a-z0-9_]*$'),
  name            text not null,
  description     text,
  -- The design flags Payroll, Documents, Settings and Audit as carrying
  -- salary, personal or audit data. A grant touching any of them needs a
  -- written reason and a second approver.
  high_risk       boolean not null default false,
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, slug)
);

create trigger roles_updated_at
  before update on roles
  for each row execute function set_updated_at();

create table role_permissions (
  role_id         uuid not null references roles(id) on delete cascade,
  permission_slug text not null references permissions(slug) on delete cascade,
  primary key (role_id, permission_slug)
);

create table user_roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role_id         uuid not null references roles(id) on delete cascade,
  granted_by      uuid references auth.users(id),
  granted_at      timestamptz not null default now(),
  unique (organization_id, user_id, role_id)
);

create index user_roles_user_org_idx on user_roles (user_id, organization_id);

-- Role grants that need two people.
--
-- The design requires a written reason AND a second approver for any grant
-- touching a flagged module — HR seconds Accounts and Management grants. That
-- is a stateful workflow, so it is modelled as data rather than a checkbox.
-- A revocation is a new row, never an edit.
create type role_grant_status as enum (
  'requested', 'awaiting_second_approver', 'active', 'revoked', 'declined'
);

create table role_grant_requests (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  target_user_id     uuid not null references auth.users(id) on delete cascade,
  role_id            uuid not null references roles(id) on delete cascade,
  status             role_grant_status not null default 'requested',
  reason             text not null check (length(trim(reason)) >= 10),
  requested_by       uuid not null references auth.users(id),
  requested_at       timestamptz not null default now(),
  second_approver_id uuid references auth.users(id),
  second_approved_at timestamptz,
  revoked_by         uuid references auth.users(id),
  revoked_at         timestamptz,
  -- A second approver may not be the requester: two people, genuinely.
  constraint second_approver_is_a_second_person
    check (second_approver_id is null or second_approver_id <> requested_by)
);

create index role_grant_requests_org_idx on role_grant_requests (organization_id, status);


-- ---------------------------------------------------------------------------
-- Helpers. Defined once here; no policy reimplements this logic inline.
--
-- All are `stable`, `security definer` with a pinned search_path so a caller
-- cannot shadow `public` with their own objects and change what they resolve.
-- ---------------------------------------------------------------------------

-- The organization the caller is currently acting in, read from the JWT claim
-- the access token hook stamps. Null when unauthenticated or not yet scoped.
create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'organization_id',
      ''
    ),
    ''
  )::uuid;
$$;

-- True when the caller holds the permission in their current organization.
create or replace function has_permission(permission_slug text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (
      select jsonb_path_exists(
        coalesce(
          current_setting('request.jwt.claims', true)::jsonb -> 'permissions',
          '[]'::jsonb
        ),
        ('$[*] ? (@ == "' || replace(permission_slug, '"', '') || '")')::jsonpath
      )
    ),
    false
  );
$$;

-- The caller's user id. Mirrors auth.uid() but keeps policies readable and
-- gives one place to change if the claim source ever moves.
create or replace function current_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid();
$$;

create or replace function is_self(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_user_id is not null and target_user_id = auth.uid();
$$;

-- Membership check that does hit the table. Used by the access token hook and
-- by the org-switch path — both run once per session, not once per row.
create or replace function is_member_of(target_org_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from organization_members
    where organization_id = target_org_id
      and user_id = target_user_id
      and status = 'active'
  );
$$;


-- Separation of duties on high-risk grants.
--
-- Enforced by a trigger rather than a CHECK constraint: the rule depends on
-- roles.high_risk, which lives in another table, and a CHECK is not
-- re-validated when that other row changes. A trigger runs at the moment the
-- grant is written, which is when the rule actually needs to hold.
create or replace function enforce_second_approver()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  role_is_high_risk boolean;
begin
  if new.status <> 'active' then
    return new;
  end if;

  select high_risk into role_is_high_risk from roles where id = new.role_id;

  if coalesce(role_is_high_risk, false) and new.second_approver_id is null then
    raise exception
      'Granting % requires a second approver: it carries payroll, document, settings or audit access',
      (select name from roles where id = new.role_id)
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger role_grant_requests_second_approver
  before insert or update on role_grant_requests
  for each row execute function enforce_second_approver();
