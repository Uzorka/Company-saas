-- ===========================================================================
-- GENERATED FILE — do not edit.
-- Rebuild with: scripts/build-setup-sql.sh
--
-- Every migration in supabase/migrations/, in order, concatenated for pasting
-- into the Supabase SQL editor. Safe to run once on a fresh project.
--
-- This does NOT include supabase/seed.sql — run that separately, after
-- registering the access token hook.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0001_organizations.sql
-- ---------------------------------------------------------------------------

-- 0001_organizations
--
-- Tenancy root. Every company-owned table in later migrations carries
-- organization_id and is gated on it, so this table is the outermost boundary
-- in the product: there is no cross-tenant query anywhere, including for
-- platform administrators (design: Platform admin, "Interaction").

create extension if not exists "pgcrypto";

-- Tenant lifecycle, per the platform admin screen.
-- Trial shows a countdown but withholds no features; Setup exists with no
-- data; Suspended is read-only with a notice naming who to contact — never a
-- broken screen.
create type organization_status as enum ('active', 'trial', 'setup', 'suspended');

create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) > 0),
  slug          text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  status        organization_status not null default 'setup',
  sector        text,
  trial_ends_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table organizations is
  'Tenant root. The slug is the first URL segment of every workspace route.';

-- Per-tenant configuration. Kept apart from `organizations` so tenant identity
-- and tenant settings can carry different access rules.
--
-- default_geofence_radius_m: the design sets 150m, with a warning outside
-- 25-250m, and each office may override it. The brief proposed 10m; that is
-- below what consumer GPS can resolve, so it would classify genuine office
-- arrivals as remote. Recorded as DECISIONS.md D3, still awaiting the client.
--
-- Retention values were design assumptions pending legal counsel (D16), so
-- they are configurable rather than constants in code.
create table organization_settings (
  organization_id             uuid primary key references organizations(id) on delete cascade,
  default_geofence_radius_m   integer not null default 150 check (default_geofence_radius_m between 1 and 5000),
  currency_code               char(3) not null default 'NGN',
  timezone                    text not null default 'Africa/Lagos',
  session_timeout_minutes     integer not null default 30 check (session_timeout_minutes > 0),
  failed_login_limit          integer not null default 3 check (failed_login_limit > 0),
  lockout_minutes             integer not null default 15 check (lockout_minutes > 0),
  password_min_length         integer not null default 10 check (password_min_length >= 8),
  selfie_retention_months     integer not null default 24 check (selfie_retention_months > 0),
  coordinate_retention_months integer not null default 12 check (coordinate_retention_months > 0),
  audit_retention_years       integer not null default 7 check (audit_retention_years > 0),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

-- Offices carry their own geofence radius. The design warns outside 25-250m
-- but permits it with justification, so the check below is a sanity bound,
-- not the warning threshold — that lives in the UI.
create table offices (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  name               text not null check (length(trim(name)) > 0),
  address            text,
  latitude           numeric(9, 6) not null check (latitude between -90 and 90),
  longitude          numeric(9, 6) not null check (longitude between -180 and 180),
  geofence_radius_m  integer not null check (geofence_radius_m between 1 and 5000),
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index offices_organization_id_idx on offices (organization_id);

-- Platform administration is a separate concept from a tenant's Management
-- role. It manages tenants; it cannot read tenant records.
create table platform_admins (
  user_id    uuid primary key,
  created_at timestamptz not null default now()
);

comment on table platform_admins is
  'Platform owners. Deliberately grants no access to any tenant-owned row: '
  'the design states no cross-tenant query exists, including for this role.';

-- Keep updated_at honest without relying on the application to remember.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_updated_at
  before update on organizations
  for each row execute function set_updated_at();

create trigger organization_settings_updated_at
  before update on organization_settings
  for each row execute function set_updated_at();

create trigger offices_updated_at
  before update on offices
  for each row execute function set_updated_at();


-- ---------------------------------------------------------------------------
-- 0002_profiles.sql
-- ---------------------------------------------------------------------------

-- 0002_profiles
--
-- Identity, kept separate from employment.
--
--   auth.users  ->  profiles  ->  employees
--
-- An applicant needs no auth account, and an employee record can exist before
-- an account is invited. Collapsing these into one table would force an
-- account to exist for every person the company has ever recorded.

create table profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null check (length(trim(full_name)) > 0),
  avatar_url text,
  phone      text,
  locale     text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

-- Membership status. A suspended member keeps their record and their history;
-- nothing in this product is destroyed.
create type membership_status as enum ('active', 'invited', 'suspended');

-- A user may belong to several organizations — that is what the workspace
-- picker at /auth/workspace exists for.
create table organization_members (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  status          membership_status not null default 'invited',
  last_active_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_user_id_idx on organization_members (user_id);
create index organization_members_organization_id_idx on organization_members (organization_id);

create trigger organization_members_updated_at
  before update on organization_members
  for each row execute function set_updated_at();

-- Create the profile row alongside the auth user, so no signed-in user can
-- ever exist without one.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();


-- ---------------------------------------------------------------------------
-- 0003_rbac.sql
-- ---------------------------------------------------------------------------

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


-- ---------------------------------------------------------------------------
-- 0004_audit.sql
-- ---------------------------------------------------------------------------

-- 0004_audit
--
-- The immutable record. The one part of the system nobody can edit.
--
-- Built now rather than at the end: the design is explicit that audit writes
-- belong alongside each module rather than retrofitted, so the table has to
-- exist before the first module does. (This is why audit is migration 0004
-- and not 0013 as the brief's numbering suggested — noted in SCHEMA.md.)
--
-- Immutability is enforced by the database, not by application discipline:
-- UPDATE and DELETE are revoked from every role including Management, and a
-- trigger rejects them even if a grant is ever restored by mistake.

create table audit_logs (
  id              bigserial primary key,
  organization_id uuid not null references organizations(id) on delete restrict,
  actor_user_id   uuid references auth.users(id) on delete set null,
  action          text not null check (length(trim(action)) > 0),
  entity_type     text not null,
  entity_id       text,
  metadata        jsonb not null default '{}'::jsonb,
  -- Truncated deliberately: enough to spot an anomaly, not enough to track a
  -- person's movements.
  ip_truncated    text,
  device          text,
  created_at      timestamptz not null default now()
);

create index audit_logs_org_created_idx on audit_logs (organization_id, created_at desc);
create index audit_logs_entity_idx on audit_logs (organization_id, entity_type, entity_id);
create index audit_logs_actor_idx on audit_logs (organization_id, actor_user_id);

comment on table audit_logs is
  'Append-only. No role may update or delete a row, including Management. '
  'A correction or revocation is a new entry, never an edit. Retained 7 years.';

-- Belt and braces: the grants below remove the privilege, this rejects the
-- statement even if a future migration hands it back by accident.
create or replace function reject_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only: % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_logs_no_update
  before update on audit_logs
  for each row execute function reject_audit_mutation();

create trigger audit_logs_no_delete
  before delete on audit_logs
  for each row execute function reject_audit_mutation();

-- Supabase grants ALL on public tables to anon, authenticated and
-- service_role by default, so every one of them has to be named here.
-- service_role especially: it is the key server-side code uses, it bypasses
-- RLS, and there is no legitimate reason for it to rewrite history.
--
-- Platform roles (postgres, supabase_admin, dashboard_user) keep their
-- grants — revoking those would break the dashboard's own table tooling —
-- and the trigger above still refuses the statement whoever issues it.
revoke update, delete, truncate on audit_logs
  from public, anon, authenticated, service_role;

-- The one supported way to write an audit entry. `security definer` so the
-- caller needs no direct insert privilege, and the organization is taken from
-- the caller's own claim rather than from an argument — a caller cannot forge
-- an entry against another tenant.
create or replace function write_audit(
  p_action      text,
  p_entity_type text,
  p_entity_id   text default null,
  p_metadata    jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_id bigint;
  org_id uuid := current_org_id();
begin
  if org_id is null then
    raise exception 'write_audit requires an organization-scoped session'
      using errcode = 'insufficient_privilege';
  end if;

  insert into audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
  values (org_id, auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function write_audit(text, text, text, jsonb) to authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 0005_rls.sql
-- ---------------------------------------------------------------------------

-- 0005_rls
--
-- Row Level Security for everything created so far.
--
-- Principles, from docs/PHASE_0_PLAN.md section 0.8:
--
--  * Default deny. RLS is enabled on every table and each one gets explicit
--    per-command policies. There is no `authenticated = true` policy on any
--    sensitive table — a test in this phase asserts that.
--  * Organization isolation is the outermost gate: current_org_id() comes from
--    a signed JWT claim the client cannot set.
--  * Policies test permissions, never role names.
--  * RLS is one of two independent layers. Server actions re-check permission
--    with validated input; neither layer substitutes for the other.

alter table organizations          enable row level security;
alter table organization_settings  enable row level security;
alter table offices                enable row level security;
alter table platform_admins        enable row level security;
alter table profiles               enable row level security;
alter table organization_members   enable row level security;
alter table roles                  enable row level security;
alter table role_permissions       enable row level security;
alter table user_roles             enable row level security;
alter table role_grant_requests    enable row level security;
alter table permissions            enable row level security;
alter table audit_logs             enable row level security;

-- Force RLS for table owners too, so a definer function or a superuser-owned
-- connection cannot quietly read across tenants.
alter table organizations         force row level security;
alter table organization_settings force row level security;
alter table offices               force row level security;
alter table organization_members  force row level security;
alter table roles                 force row level security;
alter table user_roles            force row level security;
alter table role_grant_requests   force row level security;
alter table audit_logs            force row level security;


-- ---------------------------------------------------------------------------
-- organizations — a member sees their own tenant, and only that one.
-- ---------------------------------------------------------------------------
create policy organizations_select_own on organizations
  for select to authenticated
  using (id = current_org_id());

create policy organizations_update_managed on organizations
  for update to authenticated
  using (id = current_org_id() and has_permission('organization.manage'))
  with check (id = current_org_id() and has_permission('organization.manage'));


-- ---------------------------------------------------------------------------
-- organization_settings — readable by any member, writable with settings.manage.
-- ---------------------------------------------------------------------------
create policy org_settings_select on organization_settings
  for select to authenticated
  using (organization_id = current_org_id());

-- Any of the three settings scopes may write here: Management holds full
-- access, HR its structure area, Accounts its payroll area. Which columns each
-- may touch is enforced in the server action, since column-level policies
-- would duplicate the permission vocabulary in SQL.
create policy org_settings_update on organization_settings
  for update to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('settings.manage')
      or has_permission('settings.manage_structure')
      or has_permission('settings.manage_payroll')
    )
  )
  with check (
    organization_id = current_org_id()
    and (
      has_permission('settings.manage')
      or has_permission('settings.manage_structure')
      or has_permission('settings.manage_payroll')
    )
  );


-- ---------------------------------------------------------------------------
-- offices — every member needs to read these to check in; only
-- attendance.manage_locations may change them.
-- ---------------------------------------------------------------------------
create policy offices_select on offices
  for select to authenticated
  using (organization_id = current_org_id());

create policy offices_insert on offices
  for insert to authenticated
  with check (organization_id = current_org_id() and has_permission('attendance.manage_locations'));

create policy offices_update on offices
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('attendance.manage_locations'))
  with check (organization_id = current_org_id() and has_permission('attendance.manage_locations'));

-- No delete policy: offices are deactivated, not deleted. Attendance records
-- reference them and nothing in this product is destroyed.


-- ---------------------------------------------------------------------------
-- profiles — your own, plus anyone who shares your organization. A directory
-- that cannot resolve a name is not a directory.
-- ---------------------------------------------------------------------------
create policy profiles_select_self on profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_same_org on profiles
  for select to authenticated
  using (
    exists (
      select 1
      from organization_members m
      where m.user_id = profiles.id
        and m.organization_id = current_org_id()
    )
  );

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------

-- Deliberately not scoped to current_org_id(): the workspace picker at
-- /auth/workspace must list the caller's memberships *before* an organization
-- is chosen, when no org claim exists yet. Restricted to their own rows.
create policy members_select_self on organization_members
  for select to authenticated
  using (user_id = auth.uid());

create policy members_select_org on organization_members
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('employees.view_all'));

create policy members_manage on organization_members
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('roles.manage'))
  with check (organization_id = current_org_id() and has_permission('roles.manage'));


-- ---------------------------------------------------------------------------
-- permissions — the shared vocabulary. Readable by any signed-in user so the
-- roles screen can render the matrix; writable by nobody through the API.
-- ---------------------------------------------------------------------------
create policy permissions_select on permissions
  for select to authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- roles and role_permissions
-- ---------------------------------------------------------------------------
create policy roles_select on roles
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('roles.view'));

create policy roles_manage on roles
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('roles.manage'))
  with check (organization_id = current_org_id() and has_permission('roles.manage'));

create policy role_permissions_select on role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and r.organization_id = current_org_id()
        and has_permission('roles.view')
    )
  );

create policy role_permissions_manage on role_permissions
  for all to authenticated
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and r.organization_id = current_org_id()
        and has_permission('permissions.manage')
    )
  )
  with check (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and r.organization_id = current_org_id()
        and has_permission('permissions.manage')
    )
  );


-- ---------------------------------------------------------------------------
-- user_roles — you may always see your own; seeing everyone's needs roles.view.
-- ---------------------------------------------------------------------------
create policy user_roles_select_self on user_roles
  for select to authenticated
  using (user_id = auth.uid() and organization_id = current_org_id());

create policy user_roles_select_org on user_roles
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('roles.view'));

create policy user_roles_manage on user_roles
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('roles.manage'))
  with check (organization_id = current_org_id() and has_permission('roles.manage'));


-- ---------------------------------------------------------------------------
-- role_grant_requests — no delete policy anywhere: a declined or revoked
-- grant stays visible. A revocation is a new row, never an edit.
-- ---------------------------------------------------------------------------
create policy role_grants_select on role_grant_requests
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('roles.view') or target_user_id = auth.uid())
  );

create policy role_grants_insert on role_grant_requests
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('roles.manage')
    and requested_by = auth.uid()
  );

create policy role_grants_update on role_grant_requests
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('roles.manage'))
  with check (organization_id = current_org_id() and has_permission('roles.manage'));


-- ---------------------------------------------------------------------------
-- audit_logs — read with audit.view, within your tenant. There is deliberately
-- NO insert policy: entries are written only through write_audit(), which is
-- security definer and takes the organization from the caller's claim, so no
-- client can forge an entry. Update and delete are impossible by construction.
-- ---------------------------------------------------------------------------
create policy audit_select on audit_logs
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('audit.view'));


-- ---------------------------------------------------------------------------
-- platform_admins — visible only to yourself. Note that being a platform admin
-- grants no access to any tenant-owned row: there is no cross-tenant policy
-- anywhere in this file, by design.
-- ---------------------------------------------------------------------------
create policy platform_admins_select_self on platform_admins
  for select to authenticated
  using (user_id = auth.uid());


-- Table privileges. RLS narrows what a role can see; grants decide whether it
-- can attempt the command at all. Both are needed.
grant select on organizations, organization_settings, offices, profiles,
                organization_members, permissions, roles, role_permissions,
                user_roles, role_grant_requests, audit_logs
  to authenticated;

grant insert, update on organizations, organization_settings, offices, profiles,
                         organization_members, roles, role_permissions,
                         user_roles, role_grant_requests
  to authenticated;

grant delete on role_permissions, user_roles, organization_members to authenticated;


-- ---------------------------------------------------------------------------
-- 0006_permission_catalogue.sql
-- ---------------------------------------------------------------------------

-- 0006_permission_catalogue
--
-- The permission vocabulary from docs/PERMISSIONS.md, and the function that
-- provisions an organization's five default roles.
--
-- Six scopes, not five. `view_self` / `own only` is a DIFFERENT scope, not a
-- weaker `read`: an Employee sees their own payslip inside a module they
-- otherwise have no access to at all.

insert into permissions (slug, module, description) values
  ('organization.view',            'Organization', 'See the organization profile'),
  ('organization.manage',          'Organization', 'Change the organization profile'),

  ('employees.view_all',           'Employees',    'See every employee in the organization'),
  ('employees.view_department',    'Employees',    'See employees in departments the user heads'),
  ('employees.view_self',          'Employees',    'See their own employee record'),
  ('employees.create',             'Employees',    'Create an employee record'),
  ('employees.update',             'Employees',    'Change an employee record'),
  ('employees.archive',            'Employees',    'Deactivate an employee — never delete'),
  ('employees.documents.manage',   'Employees',    'Manage documents on an employee file'),

  ('departments.view',             'Departments',  'See departments'),
  ('departments.manage',           'Departments',  'Create and change departments'),
  ('departments.members.manage',   'Departments',  'Move people between departments'),

  ('attendance.view_all',          'Attendance',   'See attendance for the whole organization'),
  ('attendance.view_department',   'Attendance',   'See attendance for departments the user heads'),
  ('attendance.view_self',         'Attendance',   'See their own attendance'),
  ('attendance.check_in',          'Attendance',   'Check in and out for themselves'),
  ('attendance.review',            'Attendance',   'Review, flag and correct attendance records'),
  ('attendance.manage_locations',  'Attendance',   'Manage offices and geofence radii'),

  ('tasks.view_all',               'Tasks',        'See every task'),
  ('tasks.view_department',        'Tasks',        'See tasks in departments the user heads'),
  ('tasks.view_assigned',          'Tasks',        'See tasks assigned to them'),
  ('tasks.create',                 'Tasks',        'Create tasks'),
  ('tasks.assign_any',             'Tasks',        'Assign a task to anyone'),
  ('tasks.assign_department',      'Tasks',        'Assign a task within their department'),
  ('tasks.update_any',             'Tasks',        'Change any task'),
  ('tasks.update_assigned',        'Tasks',        'Change tasks assigned to them'),
  ('tasks.comment',                'Tasks',        'Comment on a task'),
  ('tasks.verify_visit',           'Tasks',        'Accept or return field-visit evidence'),

  ('leave.view_all',               'Leave',        'See every leave request'),
  ('leave.view_department',        'Leave',        'See leave for departments the user heads'),
  ('leave.view_self',              'Leave',        'See their own leave'),
  ('leave.request',                'Leave',        'Request leave'),
  ('leave.approve_department',     'Leave',        'Approve leave as head of department'),
  ('leave.approve_hr',             'Leave',        'Give final HR approval'),
  ('leave.manage_policy',          'Leave',        'Manage leave types and policies'),

  ('payroll.view_all',             'Payroll',      'See payroll for every employee'),
  ('payroll.view_self',            'Payroll',      'See their own payslips'),
  ('payroll.manage_components',    'Payroll',      'Manage salary components'),
  ('payroll.create',               'Payroll',      'Create a payroll period'),
  ('payroll.process',              'Payroll',      'Advance a run through processing'),
  ('payroll.approve',              'Payroll',      'Approve a run — never one Accounts submitted'),
  ('payroll.publish',              'Payroll',      'Publish payslips — irreversible'),
  ('payroll.reports',              'Payroll',      'See payroll reports'),

  ('recruitment.view',             'Recruitment',  'See jobs and applicants'),
  ('recruitment.manage_jobs',      'Recruitment',  'Publish and unpublish jobs'),
  ('recruitment.manage_applications','Recruitment','Manage applications'),
  ('recruitment.move_pipeline',    'Recruitment',  'Move an applicant between stages'),
  ('recruitment.convert_employee', 'Recruitment',  'Convert an applicant to an employee'),

  ('documents.view',               'Documents',    'See documents allowed by their sensitivity'),
  ('documents.manage',             'Documents',    'Upload, replace and reclassify documents'),

  ('reports.management',           'Reports',      'Organisation-wide reports'),
  ('reports.hr',                   'Reports',      'People reports'),
  ('reports.payroll',              'Reports',      'Payroll reports'),
  ('reports.department',           'Reports',      'Reports scoped to their department'),

  ('roles.view',                   'Settings',     'See roles and the permission matrix'),
  ('roles.manage',                 'Settings',     'Assign and revoke roles'),
  ('permissions.manage',           'Settings',     'Change what a role may do'),
  ('settings.manage',              'Settings',     'Change any company setting — full access'),
  -- The design's "Some areas" scope: by subject, not department.
  ('settings.manage_structure',     'Settings',     'Departments and leave types — HR''s area'),
  ('settings.manage_payroll',       'Settings',     'Payroll rates and statutory settings — Accounts'' area'),

  ('audit.view',                   'Audit',        'Read the audit log');


-- Provision the five default roles for an organization.
--
-- The grants below are the design's 10x5 matrix, read across each role's row.
-- Two of them are load-bearing and easy to get wrong later:
--   * HR has NO payroll permissions at all.
--   * Accounts has NO recruitment, leave-approval or HR permissions.
-- Neither inherits the other's access.
create or replace function provision_default_roles(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  new_role_id uuid;
begin
  for r in
    select * from (values
      ('management', 'Management', 'Full visibility across the organisation, including payroll figures and the audit log.', true),
      ('hr',         'HR',         'Owns people data, hiring and documents. Cannot see payroll figures.', true),
      ('accounts',   'Accounts',   'Runs payroll and publishes payslips. Sees salary for every employee.', true),
      ('hod',        'Head of Department', 'Runs a department: its people, tasks, attendance and leave.', false),
      ('employee',   'Employee',   'Their own record, tasks, leave and payslips.', false)
    ) as t(slug, name, description, high_risk)
  loop
    insert into roles (organization_id, slug, name, description, high_risk, is_system)
    values (p_organization_id, r.slug, r.name, r.description, r.high_risk, true)
    on conflict (organization_id, slug) do update set name = excluded.name
    returning id into new_role_id;

    delete from role_permissions where role_id = new_role_id;

    insert into role_permissions (role_id, permission_slug)
    select new_role_id, slug from permissions where
      case r.slug
        -- Management is Full on every module in the matrix, and Read on
        -- Audit — which audit.view already is, since no role may write it.
        -- They are also employees, so they keep the self-scoped permissions.
        when 'management' then true

        when 'hr' then
          module in ('Employees', 'Departments', 'Attendance', 'Recruitment', 'Documents')
          or slug in (
            'organization.view',
            'leave.view_all', 'leave.view_self', 'leave.request',
            'leave.approve_hr', 'leave.manage_policy',
            'tasks.view_all', 'tasks.view_assigned', 'tasks.comment',
            'reports.hr', 'roles.view', 'attendance.check_in',
            'settings.manage_structure'
          )

        when 'accounts' then
          module = 'Payroll'
          or slug in (
            'organization.view',
            'employees.view_all', 'employees.view_self',
            'attendance.view_all', 'attendance.view_self', 'attendance.check_in',
            'leave.view_all', 'leave.view_self', 'leave.request',
            'departments.view', 'documents.view',
            'reports.payroll', 'settings.manage_payroll'
          )

        when 'hod' then
          slug in (
            'organization.view',
            'employees.view_department', 'employees.view_self',
            'departments.view',
            'attendance.view_department', 'attendance.view_self', 'attendance.check_in',
            'tasks.view_department', 'tasks.view_assigned', 'tasks.create',
            'tasks.assign_department', 'tasks.update_any', 'tasks.update_assigned',
            'tasks.comment', 'tasks.verify_visit',
            'leave.view_department', 'leave.view_self', 'leave.request',
            'leave.approve_department',
            'documents.view', 'reports.department',
            'recruitment.view'
          )

        else -- employee
          slug in (
            'organization.view',
            'employees.view_self',
            'attendance.view_self', 'attendance.check_in',
            'tasks.view_assigned', 'tasks.update_assigned', 'tasks.comment',
            'leave.view_self', 'leave.request',
            'payroll.view_self',
            'documents.view'
          )
      end;
  end loop;
end;
$$;


-- ---------------------------------------------------------------------------
-- 0007_access_token_hook.sql
-- ---------------------------------------------------------------------------

-- 0007_access_token_hook
--
-- The custom access token hook. This is what makes the whole RLS scheme
-- affordable: it stamps organization_id, roles and permissions into the JWT at
-- sign-in, so has_permission() reads a claim instead of joining user_roles on
-- every row of every query.
--
-- Register it in Supabase under Authentication > Hooks > Customize Access
-- Token, pointing at public.custom_access_token_hook.
--
-- Security note: the claims are computed here, server-side, from the database.
-- The client never supplies them, and the token is signed — so a browser
-- cannot grant itself a permission by editing anything it holds.

create or replace function custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  claims       jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  -- Prefixed to keep it distinct from organization_members.user_id and
  -- user_roles.user_id in the queries below. A bare `user_id` here silently
  -- resolves to the column, not the variable.
  v_user_id    uuid  := (event ->> 'user_id')::uuid;
  active_org   uuid;
  role_slugs   jsonb;
  perm_slugs   jsonb;
begin
  -- Which organization is this session acting in?
  --
  -- The app sets `active_organization_id` in user metadata when the user picks
  -- a workspace. We re-verify membership here rather than trusting it: user
  -- metadata is writable by the user in Supabase, so believing it unchecked
  -- would be a tenant-crossing hole.
  select m.organization_id into active_org
  from organization_members m
  where m.user_id = v_user_id
    and m.status = 'active'
    and m.organization_id = nullif(
      coalesce(event -> 'user_metadata' ->> 'active_organization_id', ''), ''
    )::uuid
  limit 1;

  -- No valid choice yet: fall back to their most recent active membership.
  -- A user with several lands on the workspace picker regardless.
  if active_org is null then
    select m.organization_id into active_org
    from organization_members m
    where m.user_id = v_user_id
      and m.status = 'active'
    order by m.last_active_at desc nulls last, m.created_at asc
    limit 1;
  end if;

  if active_org is null then
    -- Signed in but belonging to nothing. Deliberately no org claim, so every
    -- policy denies: current_org_id() returns null and no row matches.
    claims := claims
      || jsonb_build_object('organization_id', null, 'roles', '[]'::jsonb, 'permissions', '[]'::jsonb);
    return jsonb_set(event, '{claims}', claims);
  end if;

  select coalesce(jsonb_agg(distinct r.slug), '[]'::jsonb) into role_slugs
  from user_roles ur
  join roles r on r.id = ur.role_id
  where ur.user_id = v_user_id
    and ur.organization_id = active_org;

  -- Effective permissions are the UNION across every role the user holds.
  -- Scopes add; they never cancel.
  select coalesce(jsonb_agg(distinct rp.permission_slug), '[]'::jsonb) into perm_slugs
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  where ur.user_id = v_user_id
    and ur.organization_id = active_org;

  claims := claims || jsonb_build_object(
    'organization_id', active_org,
    'roles',           role_slugs,
    'permissions',     perm_slugs
  );

  return jsonb_set(event, '{claims}', claims);
end;
$$;

grant execute on function custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function custom_access_token_hook(jsonb) from authenticated, anon, public;

-- The hook runs as supabase_auth_admin, which needs to read the tables it
-- queries. These grants are scoped to exactly those tables.
grant usage on schema public to supabase_auth_admin;
grant select on organization_members, user_roles, roles, role_permissions
  to supabase_auth_admin;

create policy auth_admin_read_members on organization_members
  for select to supabase_auth_admin using (true);
create policy auth_admin_read_user_roles on user_roles
  for select to supabase_auth_admin using (true);
create policy auth_admin_read_roles on roles
  for select to supabase_auth_admin using (true);
create policy auth_admin_read_role_permissions on role_permissions
  for select to supabase_auth_admin using (true);


-- ---------------------------------------------------------------------------
-- 0008_departments_positions.sql
-- ---------------------------------------------------------------------------

-- 0008_departments_positions
--
-- Department structure. Source: Phase 4 - Employees, Departments, Attendance.
--
-- An HOD may head more than one department, so headship is its own table
-- rather than a column on departments. That relationship is load-bearing:
-- every "Dept only" scope in the permission matrix resolves through it.

create table departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code            text not null check (code ~ '^[A-Z0-9-]{2,16}$'),
  name            text not null check (length(trim(name)) > 0),
  description     text,
  parent_id       uuid references departments(id) on delete set null,
  -- Deactivated, never deleted: attendance, tasks and payroll all reference
  -- departments historically.
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code)
);

create index departments_org_idx on departments (organization_id);

create trigger departments_updated_at
  before update on departments
  for each row execute function set_updated_at();

create table positions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  department_id   uuid references departments(id) on delete set null,
  title           text not null check (length(trim(title)) > 0),
  grade           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, department_id, title)
);

create index positions_org_idx on positions (organization_id);

create trigger positions_updated_at
  before update on positions
  for each row execute function set_updated_at();

-- Headship. One department may have several heads over time, and one person
-- may head several departments — hence a table, not a column.
--
-- `user_id` rather than an employee id: the scope has to resolve from a JWT,
-- and not every head necessarily has an employee record yet.
create table department_heads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  department_id   uuid not null references departments(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  assigned_at     timestamptz not null default now(),
  unique (department_id, user_id)
);

create index department_heads_user_idx on department_heads (user_id, organization_id);

-- Which departments does the caller head?
--
-- This is the SQL behind the matrix's "Dept only" scope. It is `stable` and
-- indexed on (user_id, organization_id) because it runs inside policies that
-- may be evaluated per row.
create or replace function headed_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select dh.department_id
  from department_heads dh
  where dh.user_id = auth.uid()
    and dh.organization_id = current_org_id();
$$;

create or replace function heads_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_department_id is not null
     and target_department_id in (select headed_department_ids());
$$;


-- ---------------------------------------------------------------------------
-- 0009_employees.sql
-- ---------------------------------------------------------------------------

-- 0009_employees
--
-- The people record everything else references.
--
-- Two structural decisions carry the design's requirements:
--
--  1. Compensation lives in its own table, effective-dated. A role without
--     payroll access is then denied at the TABLE level, so salary is absent
--     from the response rather than hidden in the UI — and a historical rate
--     survives a later raise, which published payslips depend on.
--
--  2. `user_id` is nullable. An employee record can exist before an account
--     is invited, and an applicant converted to an employee has a record
--     before they ever sign in.

create type employment_status as enum ('active', 'probation', 'leave', 'suspended', 'exited');
create type employment_type as enum ('full_time', 'part_time', 'contract', 'intern', 'nysc');

create table employees (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  -- Null until an account is invited. An applicant becomes an employee record
  -- first; the account follows.
  user_id           uuid references auth.users(id) on delete set null,
  employee_no       text not null check (employee_no ~ '^[A-Z]{2,5}-[0-9]{3,6}$'),
  first_name        text not null check (length(trim(first_name)) > 0),
  last_name         text not null check (length(trim(last_name)) > 0),
  photo_url         text,
  work_email        text check (work_email is null or work_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone             text,
  location          text,
  department_id     uuid references departments(id) on delete set null,
  position_id       uuid references positions(id) on delete set null,
  manager_id        uuid references employees(id) on delete set null,
  employment_type   employment_type not null default 'full_time',
  employment_status employment_status not null default 'active',
  hire_date         date not null,
  exit_date         date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, employee_no),
  unique (organization_id, user_id),
  constraint exit_date_after_hire check (exit_date is null or exit_date >= hire_date),
  constraint exited_has_exit_date check (employment_status <> 'exited' or exit_date is not null)
);

create index employees_org_idx on employees (organization_id);
create index employees_department_idx on employees (organization_id, department_id);
create index employees_user_idx on employees (user_id);
create index employees_name_idx on employees (organization_id, last_name, first_name);

create trigger employees_updated_at
  before update on employees
  for each row execute function set_updated_at();

comment on column employees.user_id is
  'Null until an account is invited. Employment and identity are separate: an '
  'applicant becomes an employee record before they ever sign in.';

-- Emergency contacts. Deliberately minimal — the design warns against
-- collecting personal information the product has no use for.
create table employee_emergency_contacts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  relationship text,
  phone        text not null check (length(trim(phone)) > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index employee_emergency_contacts_employee_idx
  on employee_emergency_contacts (employee_id);

create trigger employee_emergency_contacts_updated_at
  before update on employee_emergency_contacts
  for each row execute function set_updated_at();

-- Compensation, effective-dated.
--
-- Separate table so payroll access is enforced by table privileges. Money is
-- numeric with a stored currency; a later raise creates a new row rather than
-- editing the old one, so a published payslip never changes retroactively.
create table employee_compensation (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  basic_salary    numeric(14, 2) not null check (basic_salary >= 0),
  currency_code   char(3) not null default 'NGN',
  effective_from  date not null,
  effective_to    date,
  reason          text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  constraint compensation_period_valid
    check (effective_to is null or effective_to > effective_from)
);

create index employee_compensation_employee_idx
  on employee_compensation (employee_id, effective_from desc);

comment on table employee_compensation is
  'Effective-dated. A change is a new row, never an edit, so historical '
  'payroll stays reproducible. Separate from employees so a role without '
  'payroll access is denied at table level and salary is absent from the '
  'response rather than hidden in the UI.';

-- Employee documents. The file itself lives in private storage; this is the
-- metadata and the access control point.
create table employee_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  category        text,
  storage_path    text not null,
  mime_type       text,
  size_bytes      bigint check (size_bytes is null or size_bytes >= 0),
  expires_on      date,
  uploaded_by     uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index employee_documents_employee_idx on employee_documents (employee_id);

-- Shift patterns.
--
-- Required by the design but never given a screen: "Late" and "Absent" are
-- computed against an expected start, and Phase 4 shows a 09:00 sales shift
-- alongside an 08:00 warehouse shift. Flagged in docs/BACKLOG.md as needing a
-- design pass; built as data now so attendance in Phase 4 has something real
-- to compare against instead of a hardcoded time.
create table shift_patterns (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  starts_at        time not null,
  ends_at          time not null,
  -- ISO-8601 weekday numbers, Monday = 1. Kept explicit rather than a bitmask
  -- so a query for "who is expected today" stays readable.
  workdays         smallint[] not null default '{1,2,3,4,5}',
  grace_minutes    smallint not null default 0 check (grace_minutes between 0 and 240),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, name),
  constraint workdays_are_valid check (
    workdays <@ '{1,2,3,4,5,6,7}'::smallint[] and array_length(workdays, 1) > 0
  )
);

create trigger shift_patterns_updated_at
  before update on shift_patterns
  for each row execute function set_updated_at();

create table employee_shifts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  employee_id      uuid not null references employees(id) on delete cascade,
  shift_pattern_id uuid not null references shift_patterns(id) on delete restrict,
  effective_from   date not null,
  effective_to     date,
  created_at       timestamptz not null default now(),
  constraint shift_period_valid
    check (effective_to is null or effective_to > effective_from)
);

create index employee_shifts_employee_idx
  on employee_shifts (employee_id, effective_from desc);

-- The employee row belonging to the caller, if any. Used by every
-- `view_self` scope, so it is defined once here.
create or replace function my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id
  from employees e
  where e.user_id = auth.uid()
    and e.organization_id = current_org_id()
  limit 1;
$$;


-- ---------------------------------------------------------------------------
-- 0010_employees_rls.sql
-- ---------------------------------------------------------------------------

-- 0010_employees_rls
--
-- Policies for the people record.
--
-- Three scopes appear here and they are genuinely different, not a gradient:
--
--   view_all         the whole organization
--   view_department  only departments the caller heads
--   view_self        only the caller's own row
--
-- An Employee holds only the third. That is not a weaker Read — it is the
-- scope that lets them see their own payslip inside a module they otherwise
-- cannot open at all.

alter table departments                  enable row level security;
alter table positions                    enable row level security;
alter table department_heads             enable row level security;
alter table employees                    enable row level security;
alter table employee_emergency_contacts  enable row level security;
alter table employee_compensation        enable row level security;
alter table employee_documents           enable row level security;
alter table shift_patterns               enable row level security;
alter table employee_shifts              enable row level security;

alter table departments                 force row level security;
alter table positions                   force row level security;
alter table department_heads            force row level security;
alter table employees                   force row level security;
alter table employee_compensation       force row level security;
alter table employee_documents          force row level security;
alter table shift_patterns              force row level security;
alter table employee_shifts             force row level security;


-- ---------------------------------------------------------------------------
-- departments and positions
--
-- Readable by anyone with departments.view. Structure is not sensitive — an
-- employee needs to know which departments exist to read a directory — but it
-- is still tenant-scoped.
-- ---------------------------------------------------------------------------
create policy departments_select on departments
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('departments.view'));

create policy departments_manage on departments
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('departments.manage'))
  with check (organization_id = current_org_id() and has_permission('departments.manage'));

create policy positions_select on positions
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('departments.view'));

create policy positions_manage on positions
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('departments.manage'))
  with check (organization_id = current_org_id() and has_permission('departments.manage'));

-- Headship is visible to anyone who can see departments — knowing who runs a
-- department is ordinary organisational information. Changing it is not.
create policy department_heads_select on department_heads
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('departments.view'));

create policy department_heads_manage on department_heads
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('departments.members.manage'))
  with check (organization_id = current_org_id() and has_permission('departments.members.manage'));


-- ---------------------------------------------------------------------------
-- employees — the three scopes, as three separate policies.
--
-- Postgres ORs permissive policies together, which is exactly the union
-- semantics the matrix calls for: a user who is both an HOD and an employee
-- sees their department and themselves.
-- ---------------------------------------------------------------------------
create policy employees_select_all on employees
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('employees.view_all'));

create policy employees_select_department on employees
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('employees.view_department')
    and department_id in (select headed_department_ids())
  );

create policy employees_select_self on employees
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('employees.view_self')
    and user_id = auth.uid()
  );

create policy employees_insert on employees
  for insert to authenticated
  with check (organization_id = current_org_id() and has_permission('employees.create'));

create policy employees_update on employees
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('employees.update'))
  with check (organization_id = current_org_id() and has_permission('employees.update'));

-- No delete policy, anywhere. Employees are deactivated by setting
-- employment_status to 'exited'; the record and its history remain.


-- ---------------------------------------------------------------------------
-- emergency contacts — personal data, so narrower than the directory: HR and
-- Management who can update people, or the employee themselves.
--
-- An HOD deliberately does NOT get this. Heading a department is a reason to
-- see who is in it, not a reason to hold their next of kin.
-- ---------------------------------------------------------------------------
create policy emergency_contacts_select on employee_emergency_contacts
  for select to authenticated
  using (
    exists (
      select 1 from employees e
      where e.id = employee_emergency_contacts.employee_id
        and e.organization_id = current_org_id()
        and (has_permission('employees.update') or e.user_id = auth.uid())
    )
  );

create policy emergency_contacts_manage on employee_emergency_contacts
  for all to authenticated
  using (
    exists (
      select 1 from employees e
      where e.id = employee_emergency_contacts.employee_id
        and e.organization_id = current_org_id()
        and (has_permission('employees.update') or e.user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from employees e
      where e.id = employee_emergency_contacts.employee_id
        and e.organization_id = current_org_id()
        and (has_permission('employees.update') or e.user_id = auth.uid())
    )
  );


-- ---------------------------------------------------------------------------
-- compensation — the row that makes "HR has no payroll access" real.
--
-- Only payroll.view_all, or the employee's own record. HR holds neither, so
-- HR cannot read salary even though HR can edit everything else about the
-- same person. That is the design's matrix, enforced where it cannot be
-- bypassed by a forgotten UI check.
-- ---------------------------------------------------------------------------
create policy compensation_select_payroll on employee_compensation
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy compensation_select_self on employee_compensation
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('payroll.view_self')
    and employee_id = my_employee_id()
  );

create policy compensation_manage on employee_compensation
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.manage_components'))
  with check (organization_id = current_org_id() and has_permission('payroll.manage_components'));


-- ---------------------------------------------------------------------------
-- employee documents — own file always; everyone's needs the manage
-- permission. HR holds it, an HOD does not.
-- ---------------------------------------------------------------------------
create policy employee_documents_select on employee_documents
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('employees.documents.manage')
      or employee_id = my_employee_id()
    )
  );

create policy employee_documents_manage on employee_documents
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('employees.documents.manage'))
  with check (organization_id = current_org_id() and has_permission('employees.documents.manage'));


-- ---------------------------------------------------------------------------
-- shifts — readable by anyone who can see attendance at any scope, since a
-- shift is what "late" is measured against. Managed with settings.
-- ---------------------------------------------------------------------------
create policy shift_patterns_select on shift_patterns
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('attendance.view_all')
      or has_permission('attendance.view_department')
      or has_permission('attendance.view_self')
    )
  );

create policy shift_patterns_manage on shift_patterns
  for all to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_structure'))
  )
  with check (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_structure'))
  );

create policy employee_shifts_select on employee_shifts
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('attendance.view_all')
      or employee_id = my_employee_id()
      or exists (
        select 1 from employees e
        where e.id = employee_shifts.employee_id
          and has_permission('attendance.view_department')
          and e.department_id in (select headed_department_ids())
      )
    )
  );

create policy employee_shifts_manage on employee_shifts
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('employees.update'))
  with check (organization_id = current_org_id() and has_permission('employees.update'));


grant select on departments, positions, department_heads, employees,
                employee_emergency_contacts, employee_compensation,
                employee_documents, shift_patterns, employee_shifts
  to authenticated;

grant insert, update on departments, positions, department_heads, employees,
                        employee_emergency_contacts, employee_compensation,
                        employee_documents, shift_patterns, employee_shifts
  to authenticated;

grant delete on department_heads, employee_emergency_contacts,
                employee_documents, employee_shifts
  to authenticated;


-- ---------------------------------------------------------------------------
-- 0011_attendance.sql
-- ---------------------------------------------------------------------------

-- 0011_attendance
--
-- The verification core. Source: Phase 4, const CI (13 states) and const ATT.
--
-- The design's principle for this module: "Verification is the product... Do
-- not simplify them." Two things follow, and both are load-bearing:
--
--  1. Location is read at the moment of an action and never in the background.
--     There is no table here that could hold a track, and no column for one.
--  2. Nothing is destroyed. A correction is a new row referencing the
--     original; a forgotten check-out is auto-closed and flagged, never
--     deleted.

create type attendance_type as enum ('office', 'remote', 'uncertain');

create type attendance_state as enum (
  'checked_in',   -- open, running
  'checked_out',  -- closed normally
  'auto_closed'   -- no check-out by midnight; flagged, never deleted
);

create type attendance_review_state as enum (
  'not_required',   -- nothing anomalous
  'pending',        -- flagged, awaiting HR
  'approved',       -- HR accepted it as recorded
  'corrected'       -- superseded by a correction record
);

create table attendance_records (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  employee_id        uuid not null references employees(id) on delete cascade,
  office_id          uuid references offices(id) on delete set null,

  -- Server-authoritative. The browser's clock is never trusted for the time
  -- an employee is paid against.
  check_in_at        timestamptz not null default now(),
  check_out_at       timestamptz,

  -- The local date the shift belongs to, so a session crossing midnight still
  -- counts as one working day rather than two half-days.
  work_date          date not null,

  check_in_latitude   numeric(9, 6),
  check_in_longitude  numeric(9, 6),
  check_in_accuracy_m numeric(8, 2),
  check_in_distance_m numeric(10, 2),

  check_out_latitude   numeric(9, 6),
  check_out_longitude  numeric(9, 6),
  check_out_accuracy_m numeric(8, 2),
  check_out_distance_m numeric(10, 2),

  attendance_type    attendance_type not null,
  state              attendance_state not null default 'checked_in',
  review_state       attendance_review_state not null default 'not_required',

  -- Why this record needs a human. Kept as text codes rather than an enum so
  -- a new exception does not need a migration to be recordable.
  exception_codes    text[] not null default '{}',

  -- Minutes late against the employee's shift, null when no shift applies.
  late_by_minutes    integer,

  device             text,
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint check_out_after_check_in
    check (check_out_at is null or check_out_at >= check_in_at),
  constraint closed_records_have_a_check_out
    check (state = 'checked_in' or check_out_at is not null)
);

-- One open record per employee. This is what makes a duplicate check-in
-- impossible rather than merely discouraged by the UI.
create unique index attendance_one_open_per_employee
  on attendance_records (employee_id)
  where state = 'checked_in';

-- One record per employee per working day, so a second check-in after
-- checking out cannot silently create a parallel day.
create unique index attendance_one_per_employee_per_day
  on attendance_records (employee_id, work_date);

create index attendance_org_date_idx on attendance_records (organization_id, work_date desc);
create index attendance_employee_date_idx on attendance_records (employee_id, work_date desc);
create index attendance_review_idx on attendance_records (organization_id, review_state)
  where review_state = 'pending';

create trigger attendance_records_updated_at
  before update on attendance_records
  for each row execute function set_updated_at();

comment on table attendance_records is
  'One row per employee per working day. Location is captured only at check-in '
  'and check-out — there is deliberately no structure here capable of holding '
  'a continuous track.';

-- Evidence: the selfie. The image itself lives in a private bucket; this is
-- the metadata and the access-control point.
create type attendance_evidence_kind as enum ('check_in_selfie', 'check_out_selfie');

create table attendance_evidence (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  attendance_record_id uuid not null references attendance_records(id) on delete cascade,
  kind                 attendance_evidence_kind not null,
  storage_path         text not null,
  captured_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  unique (attendance_record_id, kind)
);

create index attendance_evidence_record_idx
  on attendance_evidence (attendance_record_id);

-- Breaks. The design's "Start a break" action on an open record.
create table attendance_breaks (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  attendance_record_id uuid not null references attendance_records(id) on delete cascade,
  started_at           timestamptz not null default now(),
  ended_at             timestamptz,
  created_at           timestamptz not null default now(),
  constraint break_ends_after_it_starts
    check (ended_at is null or ended_at >= started_at)
);

create index attendance_breaks_record_idx on attendance_breaks (attendance_record_id);

-- Corrections.
--
-- A correction is a NEW row referencing the original. The original record is
-- never edited and never deleted — the design is explicit, and an attendance
-- record is the evidence behind someone's pay.
create table attendance_corrections (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  attendance_record_id uuid not null references attendance_records(id) on delete restrict,
  corrected_by         uuid not null references auth.users(id),
  -- Mandatory wherever an action affects someone else's record.
  reason               text not null check (length(trim(reason)) >= 10),
  previous_check_in_at  timestamptz,
  previous_check_out_at timestamptz,
  new_check_in_at       timestamptz,
  new_check_out_at      timestamptz,
  previous_type        attendance_type,
  new_type             attendance_type,
  created_at           timestamptz not null default now()
);

create index attendance_corrections_record_idx
  on attendance_corrections (attendance_record_id, created_at desc);

-- The original row is the historical fact; it is not rewritten by a
-- correction. Block the two columns a correction might be tempted to edit.
create or replace function reject_check_in_time_edit()
returns trigger
language plpgsql
as $$
begin
  if old.check_in_at is distinct from new.check_in_at then
    raise exception
      'check_in_at is immutable: record a correction referencing this record instead'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger attendance_check_in_immutable
  before update on attendance_records
  for each row execute function reject_check_in_time_edit();


-- ---------------------------------------------------------------------------
-- 0012_geofence.sql
-- ---------------------------------------------------------------------------

-- 0012_geofence
--
-- Distance and classification, in SQL so the database and the application
-- cannot disagree about whether someone was at the office.
--
-- The rule, stated carefully, because this is where the product is most
-- tempted to overclaim:
--
--   A GPS fix is a circle, not a point. `accuracy_m` is the radius of that
--   circle. So the honest question is not "is the reported point inside the
--   fence" but "can we tell which side of the fence the person is on".
--
--     distance + accuracy <= radius   -> certainly inside   -> office
--     distance - accuracy >  radius   -> certainly outside  -> remote
--     otherwise                       -> cannot tell        -> uncertain
--
--   The design's own example: a 10m radius with a ±50m fix cannot be resolved
--   either way, and must be reviewed rather than asserted.
--
-- Classification and review are separate concerns. A fix can be geometrically
-- decisive and still be poor enough in absolute terms to deserve a human
-- glance — 3.8km away with ±140m is certainly outside the fence, but the
-- employee's claim about *where* they are is not corroborated.

-- Great-circle distance in metres. Haversine on a spherical earth: accurate
-- to ~0.5%, which is far inside any GPS error we will ever see here, and it
-- avoids a PostGIS dependency for one function.
create or replace function geo_distance_m(
  lat1 numeric, lon1 numeric,
  lat2 numeric, lon2 numeric
)
returns numeric
language sql
immutable
parallel safe
as $$
  select round(
    (6371000 * 2 * asin(
      sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2)
      )
    ))::numeric
  , 2);
$$;

comment on function geo_distance_m is
  'Great-circle distance in metres (haversine). Spherical-earth approximation, '
  'accurate to roughly 0.5% — well inside GPS error at any distance this '
  'product cares about.';

-- Classify a fix against a fence.
--
-- `accuracy_m` null means the device gave no accuracy figure. That is not the
-- same as a perfect fix, so it is treated as unresolvable rather than exact.
create or replace function classify_attendance(
  distance_m  numeric,
  accuracy_m  numeric,
  radius_m    numeric
)
returns attendance_type
language sql
immutable
parallel safe
as $$
  select case
    when distance_m is null then 'uncertain'::attendance_type
    when accuracy_m is null then 'uncertain'::attendance_type
    when distance_m + accuracy_m <= radius_m then 'office'::attendance_type
    when distance_m - accuracy_m >  radius_m then 'remote'::attendance_type
    else 'uncertain'::attendance_type
  end;
$$;

comment on function classify_attendance is
  'Office / remote / uncertain from distance, accuracy and radius. A fix is a '
  'circle: only a fix whose whole circle falls on one side of the fence is '
  'decisive. Everything else is uncertain and goes to a person.';

-- Absolute-accuracy threshold beyond which a fix is flagged for review even
-- when it is geometrically decisive. 100m is a judgement, not a design
-- constant — the design shows ±140m treated as needing attention and ±8-12m
-- treated as routine.
create or replace function attendance_exception_codes(
  distance_m   numeric,
  accuracy_m   numeric,
  radius_m     numeric,
  has_selfie   boolean,
  classified   attendance_type
)
returns text[]
language sql
immutable
parallel safe
as $$
  select array_remove(array[
    case when distance_m is null then 'no_location' end,
    case when accuracy_m is null and distance_m is not null then 'no_accuracy' end,
    case when accuracy_m is not null and accuracy_m > 100 then 'poor_accuracy' end,
    case when classified = 'uncertain' then 'position_unresolved' end,
    case when not has_selfie then 'no_selfie' end
  ], null);
$$;

-- Does this record need a person to look at it?
create or replace function attendance_needs_review(codes text[])
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(array_length(codes, 1), 0) > 0;
$$;

-- Minutes late against a shift, or null when the employee has no shift on
-- that date. Null is not zero: "not applicable" and "on time" are different
-- facts, and reporting them as the same would overstate punctuality.
create or replace function minutes_late(
  check_in_at   timestamptz,
  shift_start   time,
  grace_minutes integer,
  tz            text
)
returns integer
language sql
stable
as $$
  select case
    when shift_start is null then null
    else greatest(
      0,
      (extract(epoch from (
        (check_in_at at time zone tz)::time - shift_start
      )) / 60)::integer - coalesce(grace_minutes, 0)
    )
  end;
$$;

-- Nearest active office to a fix, with the distance to it.
create or replace function nearest_office(
  p_organization_id uuid,
  p_latitude        numeric,
  p_longitude       numeric
)
returns table (office_id uuid, distance_m numeric, radius_m integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id,
         geo_distance_m(p_latitude, p_longitude, o.latitude, o.longitude),
         o.geofence_radius_m
  from offices o
  where o.organization_id = p_organization_id
    and o.active
  order by geo_distance_m(p_latitude, p_longitude, o.latitude, o.longitude)
  limit 1;
$$;


-- ---------------------------------------------------------------------------
-- 0013_attendance_rls.sql
-- ---------------------------------------------------------------------------

-- 0013_attendance_rls
--
-- Attendance policies, plus the write paths.
--
-- Check-in is not an ordinary insert: the classification, the exception codes
-- and the timestamp all have to be computed server-side from the caller's own
-- identity, or an employee could record themselves as being at the office by
-- posting whatever they liked. So there is no INSERT policy on
-- attendance_records at all — the only way in is check_in(), which is
-- security definer and derives everything it can rather than accepting it.

alter table attendance_records     enable row level security;
alter table attendance_evidence    enable row level security;
alter table attendance_breaks      enable row level security;
alter table attendance_corrections enable row level security;

alter table attendance_records     force row level security;
alter table attendance_evidence    force row level security;
alter table attendance_breaks      force row level security;
alter table attendance_corrections force row level security;

-- The three scopes again. Postgres ORs them, so an HOD who is also an
-- employee sees their department and themselves.
create policy attendance_select_all on attendance_records
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('attendance.view_all'));

create policy attendance_select_department on attendance_records
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('attendance.view_department')
    and exists (
      select 1 from employees e
      where e.id = attendance_records.employee_id
        and e.department_id in (select headed_department_ids())
    )
  );

create policy attendance_select_self on attendance_records
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('attendance.view_self')
    and employee_id = my_employee_id()
  );

-- Review actions only. Times are immutable (see the trigger in 0011) and a
-- correction is a separate record, so this covers flagging and approving.
create policy attendance_review on attendance_records
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('attendance.review'))
  with check (organization_id = current_org_id() and has_permission('attendance.review'));

-- Deliberately no INSERT and no DELETE policy. Records are created by
-- check_in() and never removed.

-- Visibility follows the parent record — the policies above already decide who
-- may see it, so this cannot widen access to a selfie. The explicit tenant
-- check is belt and braces: inheriting isolation from a join is correct but
-- invisible, and a future change to the parent policy should not be able to
-- silently widen this one.
create policy attendance_evidence_select on attendance_evidence
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_evidence.attendance_record_id
    )
  );

create policy attendance_breaks_select on attendance_breaks
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_breaks.attendance_record_id
    )
  );

create policy attendance_breaks_own on attendance_breaks
  for all to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_breaks.attendance_record_id
        and r.employee_id = my_employee_id()
    )
  )
  with check (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_breaks.attendance_record_id
        and r.employee_id = my_employee_id()
    )
  );

-- Corrections are visible to whoever can see the record they correct, and
-- writable only with attendance.review. No update, no delete: a correction is
-- itself a historical fact.
create policy attendance_corrections_select on attendance_corrections
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from attendance_records r
      where r.id = attendance_corrections.attendance_record_id
    )
  );

create policy attendance_corrections_insert on attendance_corrections
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('attendance.review')
    and corrected_by = auth.uid()
  );

grant select on attendance_records, attendance_evidence, attendance_breaks,
                attendance_corrections
  to authenticated;
grant update on attendance_records to authenticated;
grant insert, update, delete on attendance_breaks to authenticated;
grant insert on attendance_corrections to authenticated;


-- ---------------------------------------------------------------------------
-- 0014_attendance_actions.sql
-- ---------------------------------------------------------------------------

-- 0014_attendance_actions
--
-- The only ways to write an attendance record.
--
-- Both are `security definer` and derive everything they can rather than
-- accepting it. The caller supplies a position and an accuracy — facts only
-- their device knows — and nothing else. In particular the caller cannot
-- supply:
--
--   * the employee the record belongs to  (taken from their own identity)
--   * the organization                    (taken from their own claim)
--   * the time                            (now(), server-side)
--   * the classification                  (computed from the position)
--   * whether it needs review             (computed)
--
-- An employee therefore cannot record themselves as being at the office by
-- posting a chosen value, which is the whole point of the module.

create or replace function check_in(
  p_latitude   numeric default null,
  p_longitude  numeric default null,
  p_accuracy_m numeric default null,
  p_device     text    default null
)
returns attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org        uuid := current_org_id();
  v_employee   uuid := my_employee_id();
  v_office     uuid;
  v_distance   numeric;
  v_radius     integer;
  v_type       attendance_type;
  v_codes      text[];
  v_tz         text;
  v_shift      record;
  v_record     attendance_records;
  v_work_date  date;
begin
  if v_org is null or v_employee is null then
    raise exception 'No employee record for this account in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  if not has_permission('attendance.check_in') then
    raise exception 'attendance.check_in is required'
      using errcode = 'insufficient_privilege';
  end if;

  select timezone into v_tz from organization_settings where organization_id = v_org;
  v_tz := coalesce(v_tz, 'UTC');
  v_work_date := (now() at time zone v_tz)::date;

  -- Already checked in? Return the open record rather than failing. The
  -- design turns the CTA into "Check out" in that state; a duplicate attempt
  -- is a navigation problem, not an error to shout about.
  select * into v_record
  from attendance_records
  where employee_id = v_employee and state = 'checked_in';

  if found then
    return v_record;
  end if;

  if p_latitude is not null and p_longitude is not null then
    select o.office_id, o.distance_m, o.radius_m
      into v_office, v_distance, v_radius
    from nearest_office(v_org, p_latitude, p_longitude) o;
  end if;

  -- No office configured, or no position: fall back to the organization's
  -- default radius so classification still has something to measure against.
  if v_radius is null then
    select default_geofence_radius_m into v_radius
    from organization_settings where organization_id = v_org;
  end if;

  v_type := classify_attendance(v_distance, p_accuracy_m, v_radius);
  -- has_selfie is false here by construction: evidence is attached after the
  -- record exists. The code is recalculated when the selfie lands.
  v_codes := attendance_exception_codes(v_distance, p_accuracy_m, v_radius, true, v_type);

  select sp.starts_at, sp.grace_minutes into v_shift
  from employee_shifts es
  join shift_patterns sp on sp.id = es.shift_pattern_id
  where es.employee_id = v_employee
    and es.effective_from <= v_work_date
    and (es.effective_to is null or es.effective_to > v_work_date)
  order by es.effective_from desc
  limit 1;

  insert into attendance_records (
    organization_id, employee_id, office_id, work_date,
    check_in_latitude, check_in_longitude, check_in_accuracy_m, check_in_distance_m,
    attendance_type, state, review_state, exception_codes, late_by_minutes, device
  )
  values (
    v_org, v_employee, v_office, v_work_date,
    p_latitude, p_longitude, p_accuracy_m, v_distance,
    v_type, 'checked_in',
    (case when attendance_needs_review(v_codes)
          then 'pending' else 'not_required' end)::attendance_review_state,
    v_codes,
    minutes_late(now(), v_shift.starts_at, v_shift.grace_minutes, v_tz),
    p_device
  )
  returning * into v_record;

  perform write_audit(
    'attendance.check_in', 'attendance_record', v_record.id::text,
    jsonb_build_object(
      'type', v_type, 'distance_m', v_distance,
      'accuracy_m', p_accuracy_m, 'exceptions', v_codes
    )
  );

  return v_record;
end;
$$;

create or replace function check_out(
  p_latitude   numeric default null,
  p_longitude  numeric default null,
  p_accuracy_m numeric default null
)
returns attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_employee uuid := my_employee_id();
  v_distance numeric;
  v_record   attendance_records;
begin
  if v_org is null or v_employee is null then
    raise exception 'No employee record for this account in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_record
  from attendance_records
  where employee_id = v_employee and state = 'checked_in';

  if not found then
    raise exception 'Not checked in' using errcode = 'no_data_found';
  end if;

  if p_latitude is not null and p_longitude is not null and v_record.office_id is not null then
    select geo_distance_m(p_latitude, p_longitude, o.latitude, o.longitude)
      into v_distance
    from offices o where o.id = v_record.office_id;
  end if;

  update attendance_records
  set check_out_at = now(),
      check_out_latitude = p_latitude,
      check_out_longitude = p_longitude,
      check_out_accuracy_m = p_accuracy_m,
      check_out_distance_m = v_distance,
      state = 'checked_out'
  where id = v_record.id
  returning * into v_record;

  perform write_audit('attendance.check_out', 'attendance_record', v_record.id::text,
    jsonb_build_object('distance_m', v_distance, 'accuracy_m', p_accuracy_m));

  return v_record;
end;
$$;

-- Auto-close records left open past midnight.
--
-- The design: "check-out missing at midnight (auto-closes and flags, never
-- deletes)". The record keeps its check-in exactly as captured; only the
-- closure is added, and it is flagged so a person decides what the day was
-- worth rather than the system guessing.
create or replace function auto_close_stale_attendance()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  closed integer;
begin
  with stale as (
    select r.id, os.timezone
    from attendance_records r
    join organization_settings os on os.organization_id = r.organization_id
    where r.state = 'checked_in'
      and r.work_date < (now() at time zone coalesce(os.timezone, 'UTC'))::date
  )
  update attendance_records r
  set state = 'auto_closed',
      -- Midnight after the working day, but never before the check-in itself.
      -- work_date and check_in_at can disagree — a record created either side
      -- of a timezone boundary, or one whose work_date was corrected — and a
      -- check-out earlier than its check-in is not a closure, it is a broken
      -- row the constraint would rightly refuse.
      check_out_at = greatest(
        ((r.work_date + 1) || ' 00:00:00')::timestamp
          at time zone coalesce(stale.timezone, 'UTC'),
        r.check_in_at
      ),
      review_state = 'pending',
      exception_codes = array_append(r.exception_codes, 'no_check_out')
  from stale
  where r.id = stale.id;

  get diagnostics closed = row_count;
  return closed;
end;
$$;

comment on function auto_close_stale_attendance is
  'Closes records left open past their working day and flags them for review. '
  'Never deletes, and never alters the captured check-in. Schedule nightly '
  'with pg_cron.';

grant execute on function check_in(numeric, numeric, numeric, text) to authenticated;
grant execute on function check_out(numeric, numeric, numeric) to authenticated;
revoke execute on function auto_close_stale_attendance() from public, authenticated, anon;


-- ---------------------------------------------------------------------------
-- 0015_storage.sql
-- ---------------------------------------------------------------------------

-- 0015_storage
--
-- Private buckets and their policies.
--
-- Every bucket except public-assets is private. Nothing here is ever served
-- from a permanent public URL: private objects reach a browser only through a
-- short-lived signed URL issued server-side, after the same permission check
-- the table policies apply.
--
-- Object paths are prefixed with the organization id, so storage isolation is
-- keyed on the same boundary as table isolation:
--
--   attendance-selfies/{organization_id}/{employee_id}/{record_id}.jpg
--
-- On a real Supabase project the storage schema already exists. The guard
-- below lets this migration run against the local test cluster too, where it
-- does not — the policies are then skipped, and the table tests that matter
-- are unaffected.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (local test cluster) — skipping bucket setup';
    return;
  end if;

  insert into storage.buckets (id, name, public)
  values
    ('public-assets',        'public-assets',        true),
    ('employee-documents',   'employee-documents',   false),
    ('attendance-selfies',   'attendance-selfies',   false),
    ('applicant-documents',  'applicant-documents',  false),
    ('task-attachments',     'task-attachments',     false),
    ('field-visit-evidence', 'field-visit-evidence', false),
    ('company-documents',    'company-documents',    false),
    ('payslips',             'payslips',             false)
  on conflict (id) do nothing;

  -- Read: the first path segment must be the caller's own organization.
  -- Beyond that, who may see a particular selfie is decided by the table
  -- policies when the signed URL is issued — this is the outer boundary, not
  -- the whole rule.
  execute $p$
    create policy "tenant reads its own private objects"
      on storage.objects for select to authenticated
      using (
        bucket_id in (
          'employee-documents', 'attendance-selfies', 'applicant-documents',
          'task-attachments', 'field-visit-evidence', 'company-documents',
          'payslips'
        )
        and (storage.foldername(name))[1] = current_org_id()::text
      )
  $p$;

  -- Write: an employee may add their own attendance selfie; everything else
  -- is written server-side.
  execute $p$
    create policy "employee writes own attendance selfie"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'attendance-selfies'
        and (storage.foldername(name))[1] = current_org_id()::text
        and (storage.foldername(name))[2] = my_employee_id()::text
      )
  $p$;

  -- Selfies are evidence. They are never replaced or removed by the person
  -- they depict, so there is deliberately no update or delete policy —
  -- retention deletion runs server-side.
  execute $p$
    create policy "public assets are readable"
      on storage.objects for select to public
      using (bucket_id = 'public-assets')
  $p$;
end
$$;


-- ---------------------------------------------------------------------------
-- 0016_tasks.sql
-- ---------------------------------------------------------------------------

-- 0016_tasks
--
-- Tasks and field-visit verification. Source: Phase 5 - Tasks, Field Visits,
-- Leave.
--
-- The design's central rule for this module: proof is required only where it
-- is meaningful. "Do not force field verification on every task" — desk work
-- is trust-based, a store visit is not. Five verification modes, chosen per
-- task, rather than one policy for everything.

create type task_status as enum ('todo', 'in_progress', 'review', 'completed', 'cancelled');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');

-- Source: const VER in Phase 5.
create type verification_mode as enum (
  'none',                  -- marked done by the assignee; desk work
  'photo',                 -- one photo at the moment of completion
  'location',              -- a single position reading when the task closes
  'photo_location',        -- both, captured together at the site
  'photo_location_report'  -- both plus a written report; audits, stock counts
);

create table tasks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  reference         text not null,
  title             text not null check (length(trim(title)) > 0),
  description       text,
  department_id     uuid references departments(id) on delete set null,
  created_by        uuid not null references auth.users(id),
  priority          task_priority not null default 'medium',
  status            task_status not null default 'todo',
  verification_mode verification_mode not null default 'none',
  start_date        date,
  due_date          date,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, reference),
  constraint due_after_start check (due_date is null or start_date is null or due_date >= start_date)
);

create index tasks_org_status_idx on tasks (organization_id, status);
create index tasks_department_idx on tasks (organization_id, department_id);
create index tasks_due_idx on tasks (organization_id, due_date) where status <> 'completed';

create trigger tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- Multiple assignees, per the brief. A task with two people is one task.
create table task_assignees (
  task_id     uuid not null references tasks(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, employee_id)
);

create index task_assignees_employee_idx on task_assignees (employee_id);

-- Where a field task is supposed to happen.
--
-- allowed_radius_m is per-task rather than per-organization: a supermarket
-- forecourt and a small kiosk do not deserve the same tolerance.
create table task_target_locations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  task_id          uuid not null references tasks(id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  address          text,
  latitude         numeric(9, 6) not null check (latitude between -90 and 90),
  longitude        numeric(9, 6) not null check (longitude between -180 and 180),
  allowed_radius_m integer not null default 150 check (allowed_radius_m between 1 and 5000),
  contact_person   text,
  instructions     text,
  created_at       timestamptz not null default now(),
  unique (task_id)
);

create table task_comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id         uuid not null references tasks(id) on delete cascade,
  author_id       uuid not null references auth.users(id),
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now()
);

create index task_comments_task_idx on task_comments (task_id, created_at);

create table task_attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id         uuid not null references tasks(id) on delete cascade,
  name            text not null,
  storage_path    text not null,
  mime_type       text,
  size_bytes      bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by     uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- Activity. Append-only like the audit log, but scoped to one task and
-- readable by anyone who can see it — the audit log is for Management, this is
-- for the people doing the work.
create table task_activity (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id         uuid not null references tasks(id) on delete cascade,
  actor_id        uuid references auth.users(id) on delete set null,
  action          text not null,
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index task_activity_task_idx on task_activity (task_id, created_at desc);


-- ---------------------------------------------------------------------------
-- Field visits
--
-- Source: Phase 5, const FV — thirteen states, and const FV_NEXT.
--
-- Two design rules are enforced structurally rather than by the UI:
--
--   * "Out of range blocks capture." Range is checked before the camera
--     opens, so a submitted visit is one that was in range or explicitly
--     flagged — never a silent mismatch.
--   * "A returned visit keeps the original alongside the reason." A return is
--     a new state on the same row plus a reason, and the evidence stays.
-- ---------------------------------------------------------------------------
create type field_visit_state as enum (
  'assigned',
  'submitted',
  'verified',
  'returned',
  'flagged'      -- submitted but something is off; a person decides
);

create table field_visits (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  task_id           uuid not null references tasks(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete cascade,

  state             field_visit_state not null default 'assigned',

  -- Captured at submission, server-side.
  submitted_at      timestamptz,
  latitude          numeric(9, 6),
  longitude         numeric(9, 6),
  accuracy_m        numeric(8, 2),
  distance_m        numeric(10, 2),

  report            text,
  outcome           text,
  exception_codes   text[] not null default '{}',

  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  -- Mandatory on return: the assignee has to know what to do differently.
  review_reason     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint returned_visits_state_a_reason
    check (state <> 'returned' or (review_reason is not null and length(trim(review_reason)) >= 10)),
  constraint reviewed_visits_have_a_reviewer
    check (state not in ('verified', 'returned') or reviewed_by is not null)
);

create index field_visits_task_idx on field_visits (task_id);
create index field_visits_employee_idx on field_visits (employee_id);
create index field_visits_review_idx on field_visits (organization_id, state)
  where state in ('submitted', 'flagged');

create trigger field_visits_updated_at
  before update on field_visits
  for each row execute function set_updated_at();

create table field_visit_evidence (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  field_visit_id   uuid not null references field_visits(id) on delete cascade,
  storage_path     text not null,
  captured_at      timestamptz not null default now(),
  -- A re-capture after a return adds evidence rather than replacing it, so
  -- the reviewer can see both. Nothing is destroyed.
  attempt          integer not null default 1 check (attempt >= 1),
  created_at       timestamptz not null default now(),
  unique (field_visit_id, attempt)
);

-- Human-readable task references: TSK-2041, per the design.
create sequence if not exists task_reference_seq start 1000;

create or replace function next_task_reference()
returns text
language sql
volatile
as $$
  select 'TSK-' || nextval('task_reference_seq')::text;
$$;


-- ---------------------------------------------------------------------------
-- 0017_tasks_rls.sql
-- ---------------------------------------------------------------------------

-- 0017_tasks_rls
--
-- Task and field-visit policies, plus the submit/review write paths.
--
-- The scope shape here differs from employees: an assignee sees a task
-- because it was given to them, not because of their department. So
-- "view_assigned" resolves through task_assignees, and someone can hold it
-- without holding any departmental scope at all.

alter table tasks                  enable row level security;
alter table task_assignees         enable row level security;
alter table task_target_locations  enable row level security;
alter table task_comments          enable row level security;
alter table task_attachments       enable row level security;
alter table task_activity          enable row level security;
alter table field_visits           enable row level security;
alter table field_visit_evidence   enable row level security;

alter table tasks                  force row level security;
alter table task_target_locations  force row level security;
alter table task_comments          force row level security;
alter table task_attachments       force row level security;
alter table task_activity          force row level security;
alter table field_visits           force row level security;
alter table field_visit_evidence   force row level security;

-- Is this task assigned to the caller? Defined once; several policies use it.
create or replace function is_assigned_to_me(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from task_assignees ta
    where ta.task_id = target_task_id
      and ta.employee_id = my_employee_id()
  );
$$;

-- Can the caller see this task at all? The three scopes, ORed.
create or replace function can_see_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from tasks t
    where t.id = target_task_id
      and t.organization_id = current_org_id()
      and (
        has_permission('tasks.view_all')
        or (has_permission('tasks.view_department')
            and t.department_id in (select headed_department_ids()))
        or (has_permission('tasks.view_assigned') and is_assigned_to_me(t.id))
      )
  );
$$;

create policy tasks_select_all on tasks
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('tasks.view_all'));

create policy tasks_select_department on tasks
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('tasks.view_department')
    and department_id in (select headed_department_ids())
  );

create policy tasks_select_assigned on tasks
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('tasks.view_assigned')
    and is_assigned_to_me(id)
  );

create policy tasks_insert on tasks
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('tasks.create')
    and created_by = auth.uid()
    -- An HOD may only create work inside a department they head. Without
    -- this, tasks.create would let them assign across the whole company.
    and (
      has_permission('tasks.assign_any')
      or department_id in (select headed_department_ids())
    )
  );

create policy tasks_update_any on tasks
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('tasks.update_any'))
  with check (organization_id = current_org_id() and has_permission('tasks.update_any'));

create policy tasks_update_assigned on tasks
  for update to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('tasks.update_assigned')
    and is_assigned_to_me(id)
  )
  with check (organization_id = current_org_id() and is_assigned_to_me(id));

-- No delete policy. A cancelled task is status 'cancelled' and stays visible;
-- deleting work someone did is how history disappears.

create policy task_assignees_select on task_assignees
  for select to authenticated
  using (can_see_task(task_id));

create policy task_assignees_manage on task_assignees
  for all to authenticated
  using (
    exists (
      select 1 from tasks t
      where t.id = task_assignees.task_id
        and t.organization_id = current_org_id()
        and (
          has_permission('tasks.assign_any')
          or (has_permission('tasks.assign_department')
              and t.department_id in (select headed_department_ids()))
        )
    )
  )
  with check (
    exists (
      select 1 from tasks t
      where t.id = task_assignees.task_id
        and t.organization_id = current_org_id()
        and (
          has_permission('tasks.assign_any')
          or (has_permission('tasks.assign_department')
              and t.department_id in (select headed_department_ids()))
        )
    )
  );

create policy task_locations_select on task_target_locations
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

create policy task_locations_manage on task_target_locations
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('tasks.create'))
  with check (organization_id = current_org_id() and has_permission('tasks.create'));

create policy task_comments_select on task_comments
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

create policy task_comments_insert on task_comments
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('tasks.comment')
    and author_id = auth.uid()
    and can_see_task(task_id)
  );

-- Comments are not editable or deletable: a conversation someone acted on is
-- not something to quietly rewrite.

create policy task_attachments_select on task_attachments
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

create policy task_attachments_insert on task_attachments
  for insert to authenticated
  with check (organization_id = current_org_id() and can_see_task(task_id));

create policy task_activity_select on task_activity
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

-- Activity is written by the functions below, never by a client.


-- ---------------------------------------------------------------------------
-- field_visits
-- ---------------------------------------------------------------------------
create policy field_visits_select on field_visits
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

-- No insert, update or delete policy. Visits are created with the task and
-- advanced only by submit_field_visit() and review_field_visit(), which are
-- security definer and derive the position, distance and identity themselves.

create policy field_visit_evidence_select on field_visit_evidence
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from field_visits v
      where v.id = field_visit_evidence.field_visit_id
        and can_see_task(v.task_id)
    )
  );

create policy field_visit_evidence_insert on field_visit_evidence
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and exists (
      select 1 from field_visits v
      where v.id = field_visit_evidence.field_visit_id
        and v.employee_id = my_employee_id()
    )
  );

grant select on tasks, task_assignees, task_target_locations, task_comments,
                task_attachments, task_activity, field_visits,
                field_visit_evidence
  to authenticated;
grant insert, update on tasks to authenticated;
grant insert, update, delete on task_assignees to authenticated;
grant insert, update, delete on task_target_locations to authenticated;
grant insert on task_comments, task_attachments, field_visit_evidence to authenticated;


-- ---------------------------------------------------------------------------
-- 0018_field_visit_actions.sql
-- ---------------------------------------------------------------------------

-- 0018_field_visit_actions
--
-- Submitting and reviewing a field visit.
--
-- Same shape as check_in(): the caller supplies a position and a report — the
-- things only they can know — and the function derives everything else. The
-- distance in particular is computed here from the task's own target, never
-- accepted from the client, because "I was 12m from the store" is exactly the
-- claim the module exists to verify.

-- Out of range blocks capture, per the design. The threshold is the task's
-- own allowed_radius_m, and — as with attendance — a fix is a circle, so the
-- check is against the near edge of the accuracy circle rather than its
-- centre. Someone genuinely at the door with a poor fix is not turned away.
create or replace function field_visit_in_range(
  distance_m numeric,
  accuracy_m numeric,
  radius_m   numeric
)
returns boolean
language sql
immutable
parallel safe
as $$
  select distance_m is not null
     and greatest(distance_m - coalesce(accuracy_m, 0), 0) <= radius_m;
$$;

comment on function field_visit_in_range is
  'Whether the employee could plausibly be within the target radius. Measured '
  'against the near edge of the accuracy circle: a coarse fix at the door '
  'should not block a genuine visit, and the recorded accuracy lets a '
  'reviewer judge it afterwards.';

create or replace function submit_field_visit(
  p_task_id    uuid,
  p_latitude   numeric default null,
  p_longitude  numeric default null,
  p_accuracy_m numeric default null,
  p_report     text    default null,
  p_outcome    text    default null
)
returns field_visits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_employee uuid := my_employee_id();
  v_task     tasks;
  v_target   task_target_locations;
  v_distance numeric;
  v_codes    text[] := '{}';
  v_state    field_visit_state;
  v_visit    field_visits;
  v_needs_photo  boolean;
  v_needs_report boolean;
begin
  if v_org is null or v_employee is null then
    raise exception 'No employee record for this account in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_task from tasks where id = p_task_id and organization_id = v_org;
  if not found then
    raise exception 'Task not found' using errcode = 'no_data_found';
  end if;

  if not is_assigned_to_me(p_task_id) then
    raise exception 'Only an assignee can submit a visit for this task'
      using errcode = 'insufficient_privilege';
  end if;

  v_needs_photo := v_task.verification_mode in
    ('photo', 'photo_location', 'photo_location_report');
  v_needs_report := v_task.verification_mode = 'photo_location_report';

  if v_needs_report and coalesce(length(trim(p_report)), 0) < 10 then
    raise exception 'This task requires a visit report'
      using errcode = 'check_violation';
  end if;

  select * into v_target from task_target_locations where task_id = p_task_id;

  if v_target.id is not null and p_latitude is not null then
    v_distance := geo_distance_m(p_latitude, p_longitude, v_target.latitude, v_target.longitude);

    -- The block. Refused rather than recorded-and-flagged: the design checks
    -- range before the camera opens, so submitting from the wrong place is
    -- not a state this table should be able to hold.
    if not field_visit_in_range(v_distance, p_accuracy_m, v_target.allowed_radius_m) then
      raise exception
        'You are % from %, outside the % m allowed for this visit',
        round(v_distance) || 'm', v_target.name, v_target.allowed_radius_m
        using errcode = 'check_violation';
    end if;

    if p_accuracy_m is null then
      v_codes := array_append(v_codes, 'no_accuracy');
    elsif p_accuracy_m > 100 then
      v_codes := array_append(v_codes, 'poor_accuracy');
    end if;
  elsif v_task.verification_mode in ('location', 'photo_location', 'photo_location_report') then
    -- Location was required and none arrived. Recorded and reviewed by a
    -- person — the design: "No GPS or no photo is always reviewed by a
    -- person, never auto-rejected."
    v_codes := array_append(v_codes, 'no_location');
  end if;

  -- A person decides whenever anything is off; otherwise it goes to the
  -- reviewer as an ordinary submission.
  v_state := case when array_length(v_codes, 1) > 0
                  then 'flagged'::field_visit_state
                  else 'submitted'::field_visit_state end;

  insert into field_visits (
    organization_id, task_id, employee_id, state, submitted_at,
    latitude, longitude, accuracy_m, distance_m, report, outcome, exception_codes
  )
  values (
    v_org, p_task_id, v_employee, v_state, now(),
    p_latitude, p_longitude, p_accuracy_m, v_distance, p_report, p_outcome, v_codes
  )
  on conflict (id) do nothing
  returning * into v_visit;

  insert into task_activity (organization_id, task_id, actor_id, action, detail)
  values (v_org, p_task_id, auth.uid(), 'visit.submitted',
          jsonb_build_object('distance_m', v_distance, 'accuracy_m', p_accuracy_m,
                             'exceptions', v_codes, 'photo_required', v_needs_photo));

  perform write_audit('field_visit.submit', 'field_visit', v_visit.id::text,
    jsonb_build_object('task', v_task.reference, 'distance_m', v_distance,
                       'accuracy_m', p_accuracy_m, 'state', v_state));

  return v_visit;
end;
$$;

-- Accept or return. A return keeps the original evidence and states why.
create or replace function review_field_visit(
  p_visit_id uuid,
  p_accept   boolean,
  p_reason   text default null
)
returns field_visits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := current_org_id();
  v_visit field_visits;
begin
  if not has_permission('tasks.verify_visit') then
    raise exception 'tasks.verify_visit is required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_visit from field_visits
  where id = p_visit_id and organization_id = v_org;

  if not found then
    raise exception 'Visit not found' using errcode = 'no_data_found';
  end if;

  if not can_see_task(v_visit.task_id) then
    raise exception 'Not your department''s task'
      using errcode = 'insufficient_privilege';
  end if;

  if not p_accept and coalesce(length(trim(p_reason)), 0) < 10 then
    raise exception
      'Returning a visit needs a reason the assignee can act on'
      using errcode = 'check_violation';
  end if;

  update field_visits
  set state = (case when p_accept then 'verified' else 'returned' end)::field_visit_state,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_reason = p_reason
  where id = p_visit_id
  returning * into v_visit;

  insert into task_activity (organization_id, task_id, actor_id, action, detail)
  values (v_org, v_visit.task_id, auth.uid(),
          case when p_accept then 'visit.verified' else 'visit.returned' end,
          jsonb_build_object('reason', p_reason));

  perform write_audit(
    case when p_accept then 'field_visit.verify' else 'field_visit.return' end,
    'field_visit', p_visit_id::text,
    jsonb_build_object('reason', p_reason, 'original_kept', true));

  return v_visit;
end;
$$;

grant execute on function submit_field_visit(uuid, numeric, numeric, numeric, text, text) to authenticated;
grant execute on function review_field_visit(uuid, boolean, text) to authenticated;


-- ---------------------------------------------------------------------------
-- 0019_leave.sql
-- ---------------------------------------------------------------------------

-- 0019_leave
--
-- Leave, with a two-stage approval chain. Source: Phase 5 - Leave, and the
-- leave types in Phase 7 settings.
--
-- The chain is Employee -> HOD -> HR -> Approved, and it collapses to
-- Employee -> HR when the requester has no head of department. Two stages
-- exist because they ask different questions: the HOD judges coverage, HR
-- judges policy. Collapsing them into one approval loses that.
--
-- The rule that most needs to hold: **a balance moves only on final
-- approval.** Deducting at submission would make a declined request cost the
-- employee days, and deducting at HOD approval would strand days in limbo if
-- HR declines.

create type leave_status as enum (
  'draft',
  'pending_hod',
  'pending_hr',
  'approved',
  'declined',
  'cancelled'
);

create type leave_stage as enum ('hod', 'hr');
create type approval_decision as enum ('approved', 'declined');

create table leave_types (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  name                text not null check (length(trim(name)) > 0),
  description         text,
  -- Null means uncapped, as unpaid leave is. Zero would mean "none allowed",
  -- which is a different thing and would silently block every request.
  annual_entitlement_days numeric(5, 2) check (annual_entitlement_days is null or annual_entitlement_days >= 0),
  accrual_days_per_month  numeric(5, 3) check (accrual_days_per_month is null or accrual_days_per_month >= 0),
  -- Sick leave over this many consecutive days needs a certificate. Null
  -- means no document is ever required.
  document_required_after_days smallint check (document_required_after_days is null or document_required_after_days > 0),
  paid                boolean not null default true,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, name)
);

create trigger leave_types_updated_at
  before update on leave_types
  for each row execute function set_updated_at();

-- One row per employee per type per leave year.
create table leave_balances (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  leave_type_id   uuid not null references leave_types(id) on delete cascade,
  leave_year      smallint not null,
  entitled_days   numeric(5, 2) not null default 0 check (entitled_days >= 0),
  taken_days      numeric(5, 2) not null default 0 check (taken_days >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, leave_type_id, leave_year)
);

create index leave_balances_employee_idx on leave_balances (employee_id, leave_year);

create trigger leave_balances_updated_at
  before update on leave_balances
  for each row execute function set_updated_at();

create table leave_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  employee_id      uuid not null references employees(id) on delete cascade,
  leave_type_id    uuid not null references leave_types(id) on delete restrict,
  status           leave_status not null default 'draft',
  starts_on        date not null,
  ends_on          date not null,
  -- Stored rather than derived: a later change to the working calendar must
  -- not retroactively alter what an approved request cost.
  days_requested   numeric(5, 2) not null check (days_requested > 0),
  reason           text,
  document_path    text,
  submitted_at     timestamptz,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ends_on_after_starts_on check (ends_on >= starts_on)
);

create index leave_requests_employee_idx on leave_requests (employee_id, starts_on desc);
create index leave_requests_pending_idx on leave_requests (organization_id, status)
  where status in ('pending_hod', 'pending_hr');

create trigger leave_requests_updated_at
  before update on leave_requests
  for each row execute function set_updated_at();

-- Every decision, kept. A declined request keeps its reason and an approved
-- one keeps who signed it off — the design's approval timeline is rendered
-- from this table, not reconstructed.
create table leave_approvals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  leave_request_id uuid not null references leave_requests(id) on delete cascade,
  stage            leave_stage not null,
  decision         approval_decision not null,
  approver_id      uuid not null references auth.users(id),
  note             text,
  decided_at       timestamptz not null default now(),
  -- A declined stage must say why. An approval may add a note or not.
  constraint declines_state_a_reason
    check (decision <> 'declined' or (note is not null and length(trim(note)) >= 10))
);

create index leave_approvals_request_idx on leave_approvals (leave_request_id, decided_at);

comment on table leave_approvals is
  'Append-only decision history. A cancellation after approval is a new '
  'request, never an edit — so this table is the record of what was agreed.';


-- ---------------------------------------------------------------------------
-- 0020_leave_actions.sql
-- ---------------------------------------------------------------------------

-- 0020_leave_actions
--
-- The leave workflow.
--
-- Three things are decided here rather than in the application, because each
-- of them costs an employee real days if it goes wrong:
--
--   1. A balance moves ONLY on final approval.
--   2. Insufficient balance blocks submission, with the shortfall stated.
--   3. The chain routes to HR directly when the requester has no HOD.

-- Working days between two dates, weekends excluded.
--
-- Public holidays are not modelled yet — that needs the client's calendar,
-- and guessing Nigerian holidays would silently miscount leave. Flagged in
-- BACKLOG; the count is stored on the request so adding a holiday table later
-- cannot retroactively change an approved request.
create or replace function working_days_between(starts_on date, ends_on date)
returns numeric
language sql
immutable
as $$
  select count(*)::numeric
  from generate_series(starts_on, ends_on, interval '1 day') as d
  where extract(isodow from d) < 6;
$$;

-- Days left, for a type and year.
create or replace function leave_days_remaining(
  p_employee_id   uuid,
  p_leave_type_id uuid,
  p_year          smallint
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select b.entitled_days - b.taken_days
     from leave_balances b
     where b.employee_id = p_employee_id
       and b.leave_type_id = p_leave_type_id
       and b.leave_year = p_year),
    0
  );
$$;

-- Who approves first? The requester's HOD, if they have one.
create or replace function first_leave_stage(p_employee_id uuid)
returns leave_status
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1
      from employees e
      join department_heads dh on dh.department_id = e.department_id
      where e.id = p_employee_id
        -- A head does not approve their own leave; that would make the two
        -- stages one. Their request goes straight to HR.
        and dh.user_id is distinct from e.user_id
    )
    then 'pending_hod'::leave_status
    else 'pending_hr'::leave_status
  end;
$$;

comment on function first_leave_stage is
  'Routes to the HOD when the requester has one other than themselves, and '
  'straight to HR otherwise. A department head''s own leave skips the stage '
  'they would be signing.';

create or replace function submit_leave_request(
  p_leave_type_id uuid,
  p_starts_on     date,
  p_ends_on       date,
  p_reason        text default null,
  p_document_path text default null
)
returns leave_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := current_org_id();
  v_employee  uuid := my_employee_id();
  v_type      leave_types;
  v_days      numeric;
  v_remaining numeric;
  v_year      smallint := extract(year from p_starts_on)::smallint;
  v_request   leave_requests;
begin
  if v_org is null or v_employee is null then
    raise exception 'No employee record for this account in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  if not has_permission('leave.request') then
    raise exception 'leave.request is required' using errcode = 'insufficient_privilege';
  end if;

  if p_ends_on < p_starts_on then
    raise exception 'Leave cannot end before it starts' using errcode = 'check_violation';
  end if;

  select * into v_type from leave_types
  where id = p_leave_type_id and organization_id = v_org and active;
  if not found then
    raise exception 'That leave type is not available' using errcode = 'no_data_found';
  end if;

  v_days := working_days_between(p_starts_on, p_ends_on);
  if v_days <= 0 then
    raise exception 'That range contains no working days'
      using errcode = 'check_violation';
  end if;

  -- Document requirement, e.g. sick leave over three consecutive days.
  if v_type.document_required_after_days is not null
     and v_days > v_type.document_required_after_days
     and coalesce(length(trim(p_document_path)), 0) = 0 then
    raise exception
      '% over % days needs a supporting document',
      v_type.name, v_type.document_required_after_days
      using errcode = 'check_violation';
  end if;

  -- Insufficient balance blocks submission, and states the shortfall — the
  -- design is explicit that the employee should learn this before submitting,
  -- not be declined for it a week later. Uncapped types skip the check.
  if v_type.annual_entitlement_days is not null then
    v_remaining := leave_days_remaining(v_employee, p_leave_type_id, v_year);
    if v_days > v_remaining then
      raise exception
        'You have % days of % left and this request is % days — short by %',
        v_remaining, v_type.name, v_days, v_days - v_remaining
        using errcode = 'check_violation';
    end if;
  end if;

  insert into leave_requests (
    organization_id, employee_id, leave_type_id, status,
    starts_on, ends_on, days_requested, reason, document_path, submitted_at
  )
  values (
    v_org, v_employee, p_leave_type_id, first_leave_stage(v_employee),
    p_starts_on, p_ends_on, v_days, p_reason, p_document_path, now()
  )
  returning * into v_request;

  perform write_audit('leave.submit', 'leave_request', v_request.id::text,
    jsonb_build_object('type', v_type.name, 'days', v_days,
                       'routed_to', v_request.status));

  return v_request;
end;
$$;

-- Approve or decline one stage.
create or replace function decide_leave_request(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text default null
)
returns leave_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_request  leave_requests;
  v_stage    leave_stage;
  v_year     smallint;
begin
  select * into v_request from leave_requests
  where id = p_request_id and organization_id = v_org;

  if not found then
    raise exception 'Request not found' using errcode = 'no_data_found';
  end if;

  -- Which stage is this, and may the caller decide it?
  if v_request.status = 'pending_hod' then
    v_stage := 'hod';
    if not has_permission('leave.approve_department') then
      raise exception 'This request is waiting on a head of department'
        using errcode = 'insufficient_privilege';
    end if;
    if not exists (
      select 1 from employees e
      where e.id = v_request.employee_id
        and e.department_id in (select headed_department_ids())
    ) then
      raise exception 'You do not head this employee''s department'
        using errcode = 'insufficient_privilege';
    end if;
  elsif v_request.status = 'pending_hr' then
    v_stage := 'hr';
    if not has_permission('leave.approve_hr') then
      raise exception 'This request is waiting on HR'
        using errcode = 'insufficient_privilege';
    end if;
  else
    raise exception 'This request is already %', v_request.status
      using errcode = 'check_violation';
  end if;

  -- Nobody signs off their own leave, whatever permissions they hold.
  if exists (
    select 1 from employees e
    where e.id = v_request.employee_id and e.user_id = auth.uid()
  ) then
    raise exception 'You cannot decide your own leave request'
      using errcode = 'insufficient_privilege';
  end if;

  if not p_approve and coalesce(length(trim(p_note)), 0) < 10 then
    raise exception 'Declining a request needs a reason the employee can read'
      using errcode = 'check_violation';
  end if;

  insert into leave_approvals (organization_id, leave_request_id, stage,
                               decision, approver_id, note)
  values (v_org, p_request_id, v_stage,
          (case when p_approve then 'approved' else 'declined' end)::approval_decision,
          auth.uid(), p_note);

  if not p_approve then
    update leave_requests
    set status = 'declined', decided_at = now()
    where id = p_request_id
    returning * into v_request;

  elsif v_stage = 'hod' then
    -- HOD approval advances the request; it does not grant the leave, and it
    -- deliberately does not touch the balance.
    update leave_requests
    set status = 'pending_hr'
    where id = p_request_id
    returning * into v_request;

  else
    -- Final approval. This is the only place a balance moves.
    update leave_requests
    set status = 'approved', decided_at = now()
    where id = p_request_id
    returning * into v_request;

    v_year := extract(year from v_request.starts_on)::smallint;

    insert into leave_balances (organization_id, employee_id, leave_type_id,
                                leave_year, entitled_days, taken_days)
    values (v_org, v_request.employee_id, v_request.leave_type_id, v_year,
            0, v_request.days_requested)
    on conflict (employee_id, leave_type_id, leave_year)
    do update set taken_days = leave_balances.taken_days + excluded.taken_days;
  end if;

  perform write_audit(
    'leave.' || v_stage::text || '.' || (case when p_approve then 'approve' else 'decline' end),
    'leave_request', p_request_id::text,
    jsonb_build_object('note', p_note, 'status', v_request.status,
                       'days', v_request.days_requested));

  return v_request;
end;
$$;

-- An employee may withdraw their own request while it is still pending.
-- After approval it is a new request, not an edit — the design is explicit.
create or replace function cancel_leave_request(p_request_id uuid)
returns leave_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request leave_requests;
begin
  select * into v_request from leave_requests
  where id = p_request_id
    and organization_id = current_org_id()
    and employee_id = my_employee_id();

  if not found then
    raise exception 'Not your request' using errcode = 'insufficient_privilege';
  end if;

  if v_request.status not in ('draft', 'pending_hod', 'pending_hr') then
    raise exception
      'A % request cannot be cancelled — submit a new request instead',
      v_request.status
      using errcode = 'check_violation';
  end if;

  update leave_requests set status = 'cancelled', decided_at = now()
  where id = p_request_id returning * into v_request;

  perform write_audit('leave.cancel', 'leave_request', p_request_id::text, '{}'::jsonb);
  return v_request;
end;
$$;

grant execute on function submit_leave_request(uuid, date, date, text, text) to authenticated;
grant execute on function decide_leave_request(uuid, boolean, text) to authenticated;
grant execute on function cancel_leave_request(uuid) to authenticated;
grant execute on function leave_days_remaining(uuid, uuid, smallint) to authenticated;


-- ---------------------------------------------------------------------------
-- 0021_leave_rls.sql
-- ---------------------------------------------------------------------------

-- 0021_leave_rls
--
-- Leave policies.
--
-- Everything that advances a request goes through the functions in 0020, so
-- there is no update policy on leave_requests at all: the two-stage chain,
-- the self-approval block and the balance rule cannot be routed around by a
-- direct write.

alter table leave_types     enable row level security;
alter table leave_balances  enable row level security;
alter table leave_requests  enable row level security;
alter table leave_approvals enable row level security;

alter table leave_types     force row level security;
alter table leave_balances  force row level security;
alter table leave_requests  force row level security;
alter table leave_approvals force row level security;

-- Leave types are readable by everyone in the tenant — you cannot request
-- leave without knowing what kinds exist. HR owns them, per "Some areas".
create policy leave_types_select on leave_types
  for select to authenticated
  using (organization_id = current_org_id());

create policy leave_types_manage on leave_types
  for all to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('leave.manage_policy') or has_permission('settings.manage_structure'))
  )
  with check (
    organization_id = current_org_id()
    and (has_permission('leave.manage_policy') or has_permission('settings.manage_structure'))
  );

-- Balances: your own always; everyone's needs the org-wide scope. An HOD sees
-- their department's, because coverage is their judgement to make.
create policy leave_balances_select_self on leave_balances
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('leave.view_self')
    and employee_id = my_employee_id()
  );

create policy leave_balances_select_all on leave_balances
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('leave.view_all'));

create policy leave_balances_select_department on leave_balances
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('leave.view_department')
    and exists (
      select 1 from employees e
      where e.id = leave_balances.employee_id
        and e.department_id in (select headed_department_ids())
    )
  );

create policy leave_balances_manage on leave_balances
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('leave.manage_policy'))
  with check (organization_id = current_org_id() and has_permission('leave.manage_policy'));

-- Requests, three scopes as usual.
create policy leave_requests_select_self on leave_requests
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('leave.view_self')
    and employee_id = my_employee_id()
  );

create policy leave_requests_select_all on leave_requests
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('leave.view_all'));

create policy leave_requests_select_department on leave_requests
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('leave.view_department')
    and exists (
      select 1 from employees e
      where e.id = leave_requests.employee_id
        and e.department_id in (select headed_department_ids())
    )
  );

-- No insert, update or delete policy. submit_leave_request(),
-- decide_leave_request() and cancel_leave_request() are the only ways in, and
-- they are security definer.

-- The decision history is visible to anyone who can see the request it
-- belongs to. An employee sees who approved their leave and what was said.
create policy leave_approvals_select on leave_approvals
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from leave_requests r where r.id = leave_approvals.leave_request_id
    )
  );

-- Written only by decide_leave_request(). Never edited, never deleted.

grant select on leave_types, leave_balances, leave_requests, leave_approvals
  to authenticated;
grant insert, update, delete on leave_types, leave_balances to authenticated;


-- ---------------------------------------------------------------------------
-- 0022_payroll.sql
-- ---------------------------------------------------------------------------

-- 0022_payroll
--
-- Payroll. Source: Phase 6 - Payroll, Recruitment, Documents, and the
-- statutory rates in Phase 7 settings.
--
-- The highest correctness risk in the product, so three things are structural
-- rather than conventional:
--
--   1. Money is numeric. Never float — 0.1 + 0.2 costing someone a kobo is
--      not a rounding curiosity when it is their salary.
--   2. A run line is a SNAPSHOT. Every figure that made up a payslip is
--      stored on it, so a raise next March cannot alter what December paid.
--   3. Publishing is irreversible, and the pipeline enforces who may do what.
--
-- What this module deliberately does NOT do: present its output as statutory
-- compliance. Rates are configurable data supplied by the client, and the
-- brief excludes filing, remittance and pension APIs from MVP.

create type payroll_status as enum (
  'draft',       -- generated from contracts; nothing locked
  'processing',  -- Accounts is working through it
  'review',      -- figures complete, awaiting a second pair of eyes
  'approved',    -- signed off; figures locked
  'published',   -- payslips visible to employees; irreversible
  'closed'       -- fully read-only
);

create type salary_component_kind as enum (
  'recurring_earning',
  'one_time_earning',
  'recurring_deduction',
  'one_time_deduction'
);

-- Statutory rates, effective-dated.
--
-- Stored as data because they change, and because they are the client's to
-- state. The seeded values come from the design and must be confirmed against
-- current FIRS/PenCom/NHF guidance before anyone is paid from them.
create table statutory_rates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code            text not null check (code in ('pension_employee', 'pension_employer', 'nhf')),
  rate_percent    numeric(6, 3) not null check (rate_percent >= 0 and rate_percent <= 100),
  effective_from  date not null,
  effective_to    date,
  created_at      timestamptz not null default now(),
  constraint statutory_period_valid check (effective_to is null or effective_to > effective_from)
);

create index statutory_rates_lookup on statutory_rates (organization_id, code, effective_from desc);

-- Progressive tax bands. Generic rather than Nigeria-specific: a band table
-- can express any progressive schedule, and hard-coding one country's law
-- into a function would make it a lie the moment it changed.
create table paye_bands (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  band_order      smallint not null check (band_order > 0),
  -- Annual thresholds. upper_bound null means "and above".
  lower_bound     numeric(14, 2) not null check (lower_bound >= 0),
  upper_bound     numeric(14, 2),
  rate_percent    numeric(6, 3) not null check (rate_percent >= 0 and rate_percent <= 100),
  effective_from  date not null,
  effective_to    date,
  created_at      timestamptz not null default now(),
  unique (organization_id, effective_from, band_order),
  constraint band_bounds_ordered check (upper_bound is null or upper_bound > lower_bound)
);

-- Per-employee earnings and deductions beyond basic salary.
create table salary_components (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  kind            salary_component_kind not null,
  name            text not null check (length(trim(name)) > 0),
  amount          numeric(14, 2) not null check (amount >= 0),
  currency_code   char(3) not null default 'NGN',
  -- Recurring components apply every period in their window; one-time
  -- components apply to a single period and are consumed by it.
  effective_from  date,
  effective_to    date,
  taxable         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index salary_components_employee_idx on salary_components (employee_id);

create trigger salary_components_updated_at
  before update on salary_components
  for each row execute function set_updated_at();

create table payroll_periods (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  label           text not null,
  starts_on       date not null,
  ends_on         date not null,
  pay_date        date,
  status          payroll_status not null default 'draft',
  currency_code   char(3) not null default 'NGN',

  -- Separation of duties, recorded rather than assumed.
  submitted_by    uuid references auth.users(id),
  submitted_at    timestamptz,
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  published_by    uuid references auth.users(id),
  published_at    timestamptz,
  closed_at       timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (organization_id, label),
  constraint period_dates_ordered check (ends_on >= starts_on),

  -- Accounts cannot approve its own run. Enforced here, not only in the UI:
  -- it is the whole point of a two-person pipeline.
  constraint approver_is_a_second_person
    check (approved_by is null or submitted_by is null or approved_by <> submitted_by)
);

create index payroll_periods_org_idx on payroll_periods (organization_id, starts_on desc);

create trigger payroll_periods_updated_at
  before update on payroll_periods
  for each row execute function set_updated_at();

-- One line per employee per run. Every figure is stored, not derived.
--
-- This is the snapshot that makes historical payroll stable: a raise in March
-- changes employee_compensation, and touches nothing here.
create table payroll_run_lines (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  payroll_period_id   uuid not null references payroll_periods(id) on delete cascade,
  employee_id         uuid not null references employees(id) on delete restrict,

  -- Denormalised on purpose. An employee who later leaves, changes department
  -- or is renamed must not alter a payslip already issued to them.
  employee_no         text not null,
  employee_name       text not null,
  department_name     text,

  basic_salary        numeric(14, 2) not null default 0 check (basic_salary >= 0),
  total_earnings      numeric(14, 2) not null default 0 check (total_earnings >= 0),
  gross_pay           numeric(14, 2) not null default 0 check (gross_pay >= 0),

  paye                numeric(14, 2) not null default 0 check (paye >= 0),
  pension_employee    numeric(14, 2) not null default 0 check (pension_employee >= 0),
  pension_employer    numeric(14, 2) not null default 0 check (pension_employer >= 0),
  nhf                 numeric(14, 2) not null default 0 check (nhf >= 0),
  other_deductions    numeric(14, 2) not null default 0 check (other_deductions >= 0),
  total_deductions    numeric(14, 2) not null default 0 check (total_deductions >= 0),

  net_pay             numeric(14, 2) not null default 0,
  currency_code       char(3) not null default 'NGN',

  -- The components that produced the figures above, kept so a payslip can be
  -- itemised years later without re-deriving anything.
  earning_lines       jsonb not null default '[]'::jsonb,
  deduction_lines     jsonb not null default '[]'::jsonb,

  created_at          timestamptz not null default now(),
  unique (payroll_period_id, employee_id),

  constraint net_is_gross_less_deductions
    check (net_pay = gross_pay - total_deductions)
);

create index payroll_run_lines_period_idx on payroll_run_lines (payroll_period_id);
create index payroll_run_lines_employee_idx on payroll_run_lines (employee_id);

-- Adjustments: an addition or subtraction on one run, with an author and a
-- reason. Corrections after publication become an adjustment on the NEXT
-- period, never an edit to this one.
create table payroll_adjustments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  payroll_period_id uuid not null references payroll_periods(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete restrict,
  label             text not null check (length(trim(label)) > 0),
  amount            numeric(14, 2) not null,
  reason            text not null check (length(trim(reason)) >= 10),
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  constraint adjustment_is_not_zero check (amount <> 0)
);

create index payroll_adjustments_period_idx on payroll_adjustments (payroll_period_id);

create table payslips (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  payroll_run_line_id uuid not null references payroll_run_lines(id) on delete restrict,
  employee_id         uuid not null references employees(id) on delete restrict,
  published_at        timestamptz not null default now(),
  unique (payroll_run_line_id)
);

create index payslips_employee_idx on payslips (employee_id, published_at desc);


-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------

-- Run lines freeze at approval. Before that the run is being worked on and
-- recalculating is normal; after it, the figures are what two people signed.
create or replace function reject_locked_payroll_line()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status payroll_status;
begin
  select status into v_status from payroll_periods
  where id = coalesce(new.payroll_period_id, old.payroll_period_id);

  if v_status in ('approved', 'published', 'closed') then
    raise exception
      'This run is % — its figures are locked. A correction becomes an adjustment on the next period.',
      v_status
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger payroll_run_lines_locked
  before insert or update or delete on payroll_run_lines
  for each row execute function reject_locked_payroll_line();

-- A payslip is a document that has been issued. It is never edited or
-- withdrawn.
create or replace function reject_payslip_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A published payslip cannot be % — it has been issued',
    case tg_op when 'UPDATE' then 'changed' else 'withdrawn' end
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger payslips_immutable
  before update or delete on payslips
  for each row execute function reject_payslip_mutation();

revoke update, delete, truncate on payslips from public, anon, authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 0023_payroll_actions.sql
-- ---------------------------------------------------------------------------

-- 0023_payroll_actions
--
-- Payroll calculation and the six-status pipeline.
--
-- All arithmetic is here, in numeric. Nothing about a payslip is computed in
-- JavaScript: floating point is fine for a progress bar and wrong for money,
-- and the figure an employee is paid should come from one place.

-- Progressive tax on an annual amount, from the band table.
--
-- Each band taxes only the slice of income that falls inside it — that is
-- what "progressive" means, and computing it as a single rate on the whole
-- amount is the classic way to get it wrong.
create or replace function calculate_paye_annual(
  p_organization_id uuid,
  p_annual_taxable  numeric,
  p_on_date         date
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(round(sum(
    greatest(
      least(p_annual_taxable, coalesce(b.upper_bound, p_annual_taxable)) - b.lower_bound,
      0
    ) * b.rate_percent / 100
  ), 2), 0)
  from paye_bands b
  where b.organization_id = p_organization_id
    and b.effective_from <= p_on_date
    and (b.effective_to is null or b.effective_to > p_on_date)
    and b.lower_bound < p_annual_taxable;
$$;

comment on function calculate_paye_annual is
  'Progressive tax from the band table: each band taxes only the slice of '
  'income inside it. Returns zero when no bands are configured — the caller '
  'must not treat that as a computed tax of nil.';

create or replace function statutory_rate(
  p_organization_id uuid, p_code text, p_on_date date
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select rate_percent from statutory_rates
    where organization_id = p_organization_id
      and code = p_code
      and effective_from <= p_on_date
      and (effective_to is null or effective_to > p_on_date)
    order by effective_from desc
    limit 1
  ), 0);
$$;

-- Build (or rebuild) the lines for a run.
--
-- Only legal while the run is draft or processing; the trigger in 0022
-- refuses once it is approved. Rebuilding is deliberately allowed before
-- then — that is what "processing" is for.
create or replace function calculate_payroll(p_period_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_period   payroll_periods;
  v_employee record;
  v_lines    integer := 0;
  v_pension_ee numeric; v_pension_er numeric; v_nhf_rate numeric;
begin
  if not has_permission('payroll.process') then
    raise exception 'payroll.process is required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_period from payroll_periods
  where id = p_period_id and organization_id = v_org;
  if not found then
    raise exception 'Period not found' using errcode = 'no_data_found';
  end if;

  if v_period.status not in ('draft', 'processing') then
    raise exception 'A % run cannot be recalculated', v_period.status
      using errcode = 'check_violation';
  end if;

  v_pension_ee := statutory_rate(v_org, 'pension_employee', v_period.ends_on);
  v_pension_er := statutory_rate(v_org, 'pension_employer', v_period.ends_on);
  v_nhf_rate   := statutory_rate(v_org, 'nhf', v_period.ends_on);

  delete from payroll_run_lines where payroll_period_id = p_period_id;

  for v_employee in
    select e.id, e.employee_no,
           e.first_name || ' ' || e.last_name as full_name,
           d.name as department_name,
           coalesce((
             select c.basic_salary from employee_compensation c
             where c.employee_id = e.id
               and c.effective_from <= v_period.ends_on
               and (c.effective_to is null or c.effective_to > v_period.ends_on)
             order by c.effective_from desc limit 1
           ), 0) as basic
    from employees e
    left join departments d on d.id = e.department_id
    where e.organization_id = v_org
      and e.employment_status <> 'exited'
  loop
    declare
      v_earnings   numeric := 0;
      v_taxable_extra numeric := 0;
      v_other_ded  numeric := 0;
      v_gross      numeric;
      v_paye       numeric;
      v_pen_ee_amt numeric;
      v_pen_er_amt numeric;
      v_nhf_amt    numeric;
      v_adjust     numeric := 0;
      v_total_ded  numeric;
      v_earn_json  jsonb := '[]'::jsonb;
      v_ded_json   jsonb := '[]'::jsonb;
    begin
      -- Earnings and deductions in effect for this period.
      select
        coalesce(sum(amount) filter (where kind in ('recurring_earning','one_time_earning')), 0),
        coalesce(sum(amount) filter (where kind in ('recurring_earning','one_time_earning') and taxable), 0),
        coalesce(sum(amount) filter (where kind in ('recurring_deduction','one_time_deduction')), 0),
        coalesce(jsonb_agg(jsonb_build_object('name', name, 'amount', amount))
                 filter (where kind in ('recurring_earning','one_time_earning')), '[]'::jsonb),
        coalesce(jsonb_agg(jsonb_build_object('name', name, 'amount', amount))
                 filter (where kind in ('recurring_deduction','one_time_deduction')), '[]'::jsonb)
      into v_earnings, v_taxable_extra, v_other_ded, v_earn_json, v_ded_json
      from salary_components
      where employee_id = v_employee.id
        and coalesce(effective_from, v_period.starts_on) <= v_period.ends_on
        and (effective_to is null or effective_to > v_period.starts_on);

      -- Adjustments on this run, with their reasons already recorded.
      select coalesce(sum(amount), 0) into v_adjust
      from payroll_adjustments
      where payroll_period_id = p_period_id and employee_id = v_employee.id;

      v_gross := round(v_employee.basic + v_earnings + greatest(v_adjust, 0), 2);

      v_pen_ee_amt := round(v_employee.basic * v_pension_ee / 100, 2);
      v_pen_er_amt := round(v_employee.basic * v_pension_er / 100, 2);
      v_nhf_amt    := round(v_employee.basic * v_nhf_rate / 100, 2);

      -- Pension and NHF reduce taxable pay before PAYE is applied. Annualised
      -- for the band lookup, then divided back — bands are annual figures.
      v_paye := round(
        calculate_paye_annual(
          v_org,
          greatest((v_employee.basic + v_taxable_extra - v_pen_ee_amt - v_nhf_amt) * 12, 0),
          v_period.ends_on
        ) / 12, 2);

      v_total_ded := round(
        v_paye + v_pen_ee_amt + v_nhf_amt + v_other_ded + greatest(-v_adjust, 0), 2);

      insert into payroll_run_lines (
        organization_id, payroll_period_id, employee_id,
        employee_no, employee_name, department_name,
        basic_salary, total_earnings, gross_pay,
        paye, pension_employee, pension_employer, nhf,
        other_deductions, total_deductions, net_pay,
        currency_code, earning_lines, deduction_lines
      )
      values (
        v_org, p_period_id, v_employee.id,
        v_employee.employee_no, v_employee.full_name, v_employee.department_name,
        v_employee.basic, v_earnings, v_gross,
        v_paye, v_pen_ee_amt, v_pen_er_amt, v_nhf_amt,
        round(v_other_ded + greatest(-v_adjust, 0), 2), v_total_ded,
        round(v_gross - v_total_ded, 2),
        v_period.currency_code, v_earn_json, v_ded_json
      );

      v_lines := v_lines + 1;
    end;
  end loop;

  update payroll_periods set status = 'processing' where id = p_period_id;

  perform write_audit('payroll.calculate', 'payroll_period', p_period_id::text,
    jsonb_build_object('lines', v_lines));

  return v_lines;
end;
$$;

-- Advance the pipeline. Each transition has its own permission and its own
-- rule; there is no generic "set status".
create or replace function advance_payroll(p_period_id uuid, p_to payroll_status)
returns payroll_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := current_org_id();
  v_period payroll_periods;
begin
  select * into v_period from payroll_periods
  where id = p_period_id and organization_id = v_org;
  if not found then
    raise exception 'Period not found' using errcode = 'no_data_found';
  end if;

  if p_to = 'review' then
    if v_period.status <> 'processing' then
      raise exception 'Only a run in processing can be sent for review'
        using errcode = 'check_violation';
    end if;
    if not has_permission('payroll.process') then
      raise exception 'payroll.process is required' using errcode = 'insufficient_privilege';
    end if;
    if not exists (select 1 from payroll_run_lines where payroll_period_id = p_period_id) then
      raise exception 'This run has no lines to review' using errcode = 'check_violation';
    end if;
    update payroll_periods
    set status = 'review', submitted_by = auth.uid(), submitted_at = now()
    where id = p_period_id returning * into v_period;

  elsif p_to = 'approved' then
    if v_period.status <> 'review' then
      raise exception 'Only a run in review can be approved' using errcode = 'check_violation';
    end if;
    if not has_permission('payroll.approve') then
      raise exception 'payroll.approve is required' using errcode = 'insufficient_privilege';
    end if;
    -- The separation of duties. The table constraint catches it too; this
    -- raises the message a person can act on.
    if v_period.submitted_by = auth.uid() then
      raise exception
        'You submitted this run, so someone else has to approve it'
        using errcode = 'insufficient_privilege';
    end if;
    update payroll_periods
    set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = p_period_id returning * into v_period;

  elsif p_to = 'published' then
    if v_period.status <> 'approved' then
      raise exception 'Only an approved run can be published' using errcode = 'check_violation';
    end if;
    if not has_permission('payroll.publish') then
      raise exception 'payroll.publish is required' using errcode = 'insufficient_privilege';
    end if;
    update payroll_periods
    set status = 'published', published_by = auth.uid(), published_at = now()
    where id = p_period_id returning * into v_period;

    -- Issue the payslips. This is the irreversible step.
    insert into payslips (organization_id, payroll_run_line_id, employee_id)
    select organization_id, id, employee_id
    from payroll_run_lines where payroll_period_id = p_period_id
    on conflict (payroll_run_line_id) do nothing;

  elsif p_to = 'closed' then
    if v_period.status <> 'published' then
      raise exception 'Only a published run can be closed' using errcode = 'check_violation';
    end if;
    if not has_permission('payroll.process') then
      raise exception 'payroll.process is required' using errcode = 'insufficient_privilege';
    end if;
    update payroll_periods set status = 'closed', closed_at = now()
    where id = p_period_id returning * into v_period;

  else
    raise exception 'Payroll does not move to % from here', p_to
      using errcode = 'check_violation';
  end if;

  perform write_audit('payroll.' || p_to::text, 'payroll_period', p_period_id::text,
    jsonb_build_object('from', v_period.status, 'label', v_period.label));

  return v_period;
end;
$$;

grant execute on function calculate_payroll(uuid) to authenticated;
grant execute on function advance_payroll(uuid, payroll_status) to authenticated;
grant execute on function calculate_paye_annual(uuid, numeric, date) to authenticated;


-- ---------------------------------------------------------------------------
-- 0024_payroll_rls.sql
-- ---------------------------------------------------------------------------

-- 0024_payroll_rls
--
-- Payroll policies.
--
-- The matrix row this enforces: HR has NO payroll access at all, and an
-- Employee sees only their own payslip — inside a module they otherwise
-- cannot open. That "own only" scope is why payslips get their own policy
-- rather than inheriting from the run.

alter table statutory_rates     enable row level security;
alter table paye_bands          enable row level security;
alter table salary_components   enable row level security;
alter table payroll_periods     enable row level security;
alter table payroll_run_lines   enable row level security;
alter table payroll_adjustments enable row level security;
alter table payslips            enable row level security;

alter table statutory_rates     force row level security;
alter table paye_bands          force row level security;
alter table salary_components   force row level security;
alter table payroll_periods     force row level security;
alter table payroll_run_lines   force row level security;
alter table payroll_adjustments force row level security;
alter table payslips            force row level security;

-- Rates and bands: readable by anyone who can see payroll, managed by
-- whoever owns payroll settings (Accounts' area, not HR's).
create policy statutory_rates_select on statutory_rates
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy statutory_rates_manage on statutory_rates
  for all to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_payroll'))
  )
  with check (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_payroll'))
  );

create policy paye_bands_select on paye_bands
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy paye_bands_manage on paye_bands
  for all to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_payroll'))
  )
  with check (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_payroll'))
  );

-- Salary components carry pay information, so they follow the same rule as
-- compensation: payroll access, or your own.
create policy salary_components_select on salary_components
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('payroll.view_all')
      or (has_permission('payroll.view_self') and employee_id = my_employee_id())
    )
  );

create policy salary_components_manage on salary_components
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.manage_components'))
  with check (organization_id = current_org_id() and has_permission('payroll.manage_components'));

create policy payroll_periods_select on payroll_periods
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy payroll_periods_insert on payroll_periods
  for insert to authenticated
  with check (organization_id = current_org_id() and has_permission('payroll.create'));

-- Status changes go through advance_payroll(), which enforces the order and
-- the separation of duties. This covers editing labels and dates on a run
-- that has not yet been submitted.
create policy payroll_periods_update on payroll_periods
  for update to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('payroll.process')
    and status in ('draft', 'processing')
  )
  with check (organization_id = current_org_id() and has_permission('payroll.process'));

create policy payroll_run_lines_select on payroll_run_lines
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

-- Lines are written only by calculate_payroll(). No client-facing insert.

create policy payroll_adjustments_select on payroll_adjustments
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy payroll_adjustments_insert on payroll_adjustments
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('payroll.process')
    and created_by = auth.uid()
    -- An adjustment on a locked run would silently not apply, because the
    -- lines cannot be recalculated. Refuse it rather than accept a no-op.
    and exists (
      select 1 from payroll_periods p
      where p.id = payroll_adjustments.payroll_period_id
        and p.status in ('draft', 'processing')
    )
  );

-- Payslips. The "own only" scope: an Employee sees theirs and nobody else's,
-- and cannot see the run it came from.
create policy payslips_select_own on payslips
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('payroll.view_self')
    and employee_id = my_employee_id()
  );

create policy payslips_select_all on payslips
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

-- The run line behind an employee's own payslip has to be readable, or the
-- payslip is a row with no figures on it.
create policy payroll_run_lines_select_own on payroll_run_lines
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('payroll.view_self')
    and employee_id = my_employee_id()
    and exists (select 1 from payslips s where s.payroll_run_line_id = payroll_run_lines.id)
  );

grant select on statutory_rates, paye_bands, salary_components, payroll_periods,
                payroll_run_lines, payroll_adjustments, payslips
  to authenticated;
grant insert, update, delete on statutory_rates, paye_bands, salary_components to authenticated;
grant insert, update on payroll_periods to authenticated;
grant insert on payroll_adjustments to authenticated;


-- ---------------------------------------------------------------------------
-- 0025_recruitment.sql
-- ---------------------------------------------------------------------------

-- 0025_recruitment
--
-- Jobs, applications and the eight-stage pipeline. Source: Phase 6 -
-- Recruitment.
--
-- The design's framing: "candidate dignity treated as a requirement rather
-- than a nicety." Three things follow structurally:
--
--   * An applicant needs no account. They apply from the public site and are
--     a row here, not a user.
--   * Rejected and withdrawn candidates stay on the board and stay
--     searchable. Nothing is deleted.
--   * Conversion to an employee LINKS the application; it never consumes it.

create type job_status as enum ('draft', 'published', 'closed');

create type application_stage as enum (
  'applied', 'screening', 'shortlisted', 'interview',
  'offered', 'hired', 'rejected', 'withdrawn'
);

create table jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  title            text not null check (length(trim(title)) > 0),
  slug             text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  department_id    uuid references departments(id) on delete set null,
  location         text,
  employment_type  employment_type not null default 'full_time',
  summary          text,
  description      text,
  responsibilities text,
  requirements     text,
  status           job_status not null default 'draft',
  closes_on        date,
  published_at     timestamptz,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, slug)
);

create index jobs_public_idx on jobs (organization_id, status) where status = 'published';

create trigger jobs_updated_at
  before update on jobs
  for each row execute function set_updated_at();

create table job_applications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id          uuid not null references jobs(id) on delete restrict,

  -- The applicant. Deliberately not an auth user: someone applying for a job
  -- should not have to create an account with a company that has not hired
  -- them.
  first_name      text not null check (length(trim(first_name)) > 0),
  last_name       text not null check (length(trim(last_name)) > 0),
  email           text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone           text,
  location        text,
  cover_letter    text,
  cv_path         text,
  source          text,

  stage           application_stage not null default 'applied',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One application per person per role. A second attempt updates the first
  -- rather than cluttering the pipeline with duplicates.
  unique (job_id, email)
);

create index job_applications_job_idx on job_applications (job_id, stage);
create index job_applications_org_idx on job_applications (organization_id, stage);

create trigger job_applications_updated_at
  before update on job_applications
  for each row execute function set_updated_at();

comment on table job_applications is
  'Applicants are not users. Rejected and withdrawn rows stay — the design '
  'keeps candidates searchable for 12 months and never deletes a history.';

-- Every stage move, kept.
create table application_stage_history (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references job_applications(id) on delete cascade,
  from_stage     application_stage,
  to_stage       application_stage not null,
  moved_by       uuid references auth.users(id),
  note           text,
  created_at     timestamptz not null default now()
);

create index application_stage_history_idx
  on application_stage_history (application_id, created_at);

create table application_notes (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references job_applications(id) on delete cascade,
  author_id      uuid not null references auth.users(id),
  body           text not null check (length(trim(body)) > 0),
  created_at     timestamptz not null default now()
);

create index application_notes_idx on application_notes (application_id, created_at);

-- Conversion. The application is linked, never consumed.
create table applicant_conversions (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references job_applications(id) on delete restrict,
  employee_id    uuid not null references employees(id) on delete restrict,
  converted_by   uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  -- Converting twice would create a second employee record for one person.
  unique (application_id)
);

comment on table applicant_conversions is
  'Links an application to the employee record it produced. The application '
  'is kept and remains searchable; the unique constraint makes a duplicate '
  'conversion impossible rather than merely discouraged.';


-- ---------------------------------------------------------------------------
-- 0026_recruitment_actions.sql
-- ---------------------------------------------------------------------------

-- 0026_recruitment_actions
--
-- Applying, moving stages, and converting an applicant to an employee.

-- A public application.
--
-- Runs as the anonymous role, so it takes the organization from the job
-- rather than from a claim, and it accepts only published jobs. Without that
-- second check, a draft or closed role could be applied to by anyone who
-- guessed its id.
create or replace function apply_for_job(
  p_job_id       uuid,
  p_first_name   text,
  p_last_name    text,
  p_email        text,
  p_phone        text default null,
  p_location     text default null,
  p_cover_letter text default null,
  p_cv_path      text default null,
  p_source       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job jobs;
  v_id  uuid;
begin
  select * into v_job from jobs where id = p_job_id and status = 'published';
  if not found then
    raise exception 'That role is not open for applications'
      using errcode = 'no_data_found';
  end if;

  if v_job.closes_on is not null and v_job.closes_on < current_date then
    raise exception 'Applications for that role have closed'
      using errcode = 'check_violation';
  end if;

  insert into job_applications (
    organization_id, job_id, first_name, last_name, email,
    phone, location, cover_letter, cv_path, source
  )
  values (
    v_job.organization_id, p_job_id, trim(p_first_name), trim(p_last_name),
    lower(trim(p_email)), p_phone, p_location, p_cover_letter, p_cv_path, p_source
  )
  on conflict (job_id, email) do update
    set first_name = excluded.first_name,
        last_name  = excluded.last_name,
        phone      = coalesce(excluded.phone, job_applications.phone),
        location   = coalesce(excluded.location, job_applications.location),
        cover_letter = coalesce(excluded.cover_letter, job_applications.cover_letter),
        cv_path    = coalesce(excluded.cv_path, job_applications.cv_path),
        updated_at = now()
  returning id into v_id;

  insert into application_stage_history (organization_id, application_id, to_stage, note)
  values (v_job.organization_id, v_id, 'applied', 'Applied through the careers site');

  return v_id;
end;
$$;

-- Move an applicant through the pipeline.
--
-- Hired is deliberately NOT reachable here. The design: "Dragging into Hired
-- opens the convert flow rather than silently moving." Hiring someone is the
-- creation of an employee record, not a status change.
create or replace function move_application_stage(
  p_application_id uuid,
  p_to_stage       application_stage,
  p_note           text default null
)
returns job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := current_org_id();
  v_app job_applications;
begin
  if not has_permission('recruitment.move_pipeline') then
    raise exception 'recruitment.move_pipeline is required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from job_applications
  where id = p_application_id and organization_id = v_org;
  if not found then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;

  if p_to_stage = 'hired' then
    raise exception
      'Marking someone hired happens through Convert to employee, so their record is created properly'
      using errcode = 'check_violation';
  end if;

  if v_app.stage = 'hired' then
    raise exception 'This applicant has already been hired'
      using errcode = 'check_violation';
  end if;

  -- Rejecting someone should say why, so the note is not optional there.
  if p_to_stage = 'rejected' and coalesce(length(trim(p_note)), 0) < 10 then
    raise exception 'Recording a rejection needs a brief reason'
      using errcode = 'check_violation';
  end if;

  insert into application_stage_history
    (organization_id, application_id, from_stage, to_stage, moved_by, note)
  values (v_org, p_application_id, v_app.stage, p_to_stage, auth.uid(), p_note);

  update job_applications set stage = p_to_stage
  where id = p_application_id returning * into v_app;

  perform write_audit('recruitment.stage', 'job_application', p_application_id::text,
    jsonb_build_object('from', v_app.stage, 'to', p_to_stage, 'note', p_note));

  return v_app;
end;
$$;

-- Convert an applicant into an employee.
--
-- Creates the employee record and links it. The application is kept, its
-- stage becomes 'hired', and the unique constraint on applicant_conversions
-- makes a second conversion impossible.
create or replace function convert_applicant_to_employee(
  p_application_id uuid,
  p_employee_no    text,
  p_department_id  uuid default null,
  p_position_id    uuid default null,
  p_hire_date      date default null
)
returns employees
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_app      job_applications;
  v_employee employees;
begin
  if not has_permission('recruitment.convert_employee') then
    raise exception 'recruitment.convert_employee is required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from job_applications
  where id = p_application_id and organization_id = v_org;
  if not found then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from applicant_conversions where application_id = p_application_id) then
    raise exception 'This applicant has already been converted to an employee'
      using errcode = 'unique_violation';
  end if;

  -- No auth account is created here. The employee record exists first; an
  -- invitation follows separately, which is what lets HR complete someone's
  -- employment details before they ever sign in.
  insert into employees (
    organization_id, employee_no, first_name, last_name,
    work_email, phone, location, department_id, position_id, hire_date
  )
  values (
    v_org, p_employee_no, v_app.first_name, v_app.last_name,
    null, v_app.phone, v_app.location, p_department_id, p_position_id,
    coalesce(p_hire_date, current_date)
  )
  returning * into v_employee;

  insert into applicant_conversions (organization_id, application_id, employee_id, converted_by)
  values (v_org, p_application_id, v_employee.id, auth.uid());

  insert into application_stage_history
    (organization_id, application_id, from_stage, to_stage, moved_by, note)
  values (v_org, p_application_id, v_app.stage, 'hired', auth.uid(),
          'Converted to employee ' || p_employee_no);

  update job_applications set stage = 'hired' where id = p_application_id;

  perform write_audit('recruitment.convert', 'job_application', p_application_id::text,
    jsonb_build_object('employee_id', v_employee.id, 'employee_no', p_employee_no,
                       'application_kept', true));

  return v_employee;
end;
$$;

grant execute on function apply_for_job(uuid, text, text, text, text, text, text, text, text)
  to anon, authenticated;
grant execute on function move_application_stage(uuid, application_stage, text) to authenticated;
grant execute on function convert_applicant_to_employee(uuid, text, uuid, uuid, date) to authenticated;


-- ---------------------------------------------------------------------------
-- 0027_recruitment_rls.sql
-- ---------------------------------------------------------------------------

-- 0027_recruitment_rls
--
-- Recruitment policies.
--
-- The only place in this product where `anon` gets a read policy: published
-- jobs are, by definition, public. Everything else about recruitment —
-- applicants, CVs, notes — stays inside the tenant.

alter table jobs                      enable row level security;
alter table job_applications          enable row level security;
alter table application_stage_history enable row level security;
alter table application_notes         enable row level security;
alter table applicant_conversions     enable row level security;

alter table jobs                      force row level security;
alter table job_applications          force row level security;
alter table application_stage_history force row level security;
alter table application_notes         force row level security;
alter table applicant_conversions     force row level security;

-- Published jobs are readable by the public careers site. Draft and closed
-- roles are not: a role still being written should not be discoverable.
create policy jobs_public_read on jobs
  for select to anon, authenticated
  using (status = 'published');

create policy jobs_internal_read on jobs
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

create policy jobs_manage on jobs
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.manage_jobs'))
  with check (organization_id = current_org_id() and has_permission('recruitment.manage_jobs'));

-- Applicants are never public. There is no anon read policy here, and
-- applications are written only through apply_for_job().
create policy applications_read on job_applications
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

create policy applications_manage on job_applications
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.manage_applications'))
  with check (organization_id = current_org_id() and has_permission('recruitment.manage_applications'));

-- No delete policy: a rejected candidate stays searchable, per the design.

create policy stage_history_read on application_stage_history
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

create policy notes_read on application_notes
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

create policy notes_insert on application_notes
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('recruitment.view')
    and author_id = auth.uid()
  );

create policy conversions_read on applicant_conversions
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

grant select on jobs to anon, authenticated;
grant select on job_applications, application_stage_history, application_notes,
                applicant_conversions
  to authenticated;
grant insert, update, delete on jobs to authenticated;
grant update on job_applications to authenticated;
grant insert on application_notes to authenticated;


commit;
