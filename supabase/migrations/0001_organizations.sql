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
