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

revoke update, delete, truncate on audit_logs from public, anon, authenticated;

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
  user_id      uuid  := (event ->> 'user_id')::uuid;
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
  where m.user_id = custom_access_token_hook.user_id
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
    where m.user_id = custom_access_token_hook.user_id
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
  where ur.user_id = custom_access_token_hook.user_id
    and ur.organization_id = active_org;

  -- Effective permissions are the UNION across every role the user holds.
  -- Scopes add; they never cancel.
  select coalesce(jsonb_agg(distinct rp.permission_slug), '[]'::jsonb) into perm_slugs
  from user_roles ur
  join role_permissions rp on rp.role_id = ur.role_id
  where ur.user_id = custom_access_token_hook.user_id
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


commit;
