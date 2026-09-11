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


commit;
