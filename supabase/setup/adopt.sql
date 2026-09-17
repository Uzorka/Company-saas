-- ===========================================================================
-- GENERATED FILE — do not edit.
-- Rebuild with: scripts/build-setup-sql.sh
--
-- Run this ONCE, and only on a Supabase project that was set up from an
-- install.sql produced BEFORE the schema_migrations ledger existed.
--
-- It does not change your schema. For each migration it checks whether an
-- object that migration creates is actually present, and records it as
-- applied only if it is. Anything genuinely missing is left unrecorded, so
-- the next install.sql run applies it.
--
-- After this, run supabase/setup/install.sql. It will skip what you have and
-- apply only what you do not.
--
-- On a brand-new project you do not need this file at all — install.sql
-- handles a fresh database on its own.
-- ===========================================================================

begin;

create table if not exists schema_migrations (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- Deployment bookkeeping, not application data. Locked down here too, because
-- this file is the first of the two to run.
alter table schema_migrations enable row level security;
alter table schema_migrations force row level security;
revoke all on schema_migrations from anon, authenticated;

do $adopt$
begin
  if to_regclass('public.if') is not null then
    insert into schema_migrations (version) values ('0000_schema_migrations') on conflict do nothing;
    raise notice 'present, recorded: %', '0000_schema_migrations';
  else
    raise notice 'NOT present, left for install.sql: %', '0000_schema_migrations';
  end if;

  if to_regclass('public.organizations') is not null then
    insert into schema_migrations (version) values ('0001_organizations') on conflict do nothing;
    raise notice 'present, recorded: %', '0001_organizations';
  else
    raise notice 'NOT present, left for install.sql: %', '0001_organizations';
  end if;

  if to_regclass('public.profiles') is not null then
    insert into schema_migrations (version) values ('0002_profiles') on conflict do nothing;
    raise notice 'present, recorded: %', '0002_profiles';
  else
    raise notice 'NOT present, left for install.sql: %', '0002_profiles';
  end if;

  if to_regclass('public.permissions') is not null then
    insert into schema_migrations (version) values ('0003_rbac') on conflict do nothing;
    raise notice 'present, recorded: %', '0003_rbac';
  else
    raise notice 'NOT present, left for install.sql: %', '0003_rbac';
  end if;

  if to_regclass('public.audit_logs') is not null then
    insert into schema_migrations (version) values ('0004_audit') on conflict do nothing;
    raise notice 'present, recorded: %', '0004_audit';
  else
    raise notice 'NOT present, left for install.sql: %', '0004_audit';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'organizations_select_own') then
    insert into schema_migrations (version) values ('0005_rls') on conflict do nothing;
    raise notice 'present, recorded: %', '0005_rls';
  else
    raise notice 'NOT present, left for install.sql: %', '0005_rls';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'provision_default_roles') then
    insert into schema_migrations (version) values ('0006_permission_catalogue') on conflict do nothing;
    raise notice 'present, recorded: %', '0006_permission_catalogue';
  else
    raise notice 'NOT present, left for install.sql: %', '0006_permission_catalogue';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'custom_access_token_hook') then
    insert into schema_migrations (version) values ('0007_access_token_hook') on conflict do nothing;
    raise notice 'present, recorded: %', '0007_access_token_hook';
  else
    raise notice 'NOT present, left for install.sql: %', '0007_access_token_hook';
  end if;

  if to_regclass('public.departments') is not null then
    insert into schema_migrations (version) values ('0008_departments_positions') on conflict do nothing;
    raise notice 'present, recorded: %', '0008_departments_positions';
  else
    raise notice 'NOT present, left for install.sql: %', '0008_departments_positions';
  end if;

  if to_regclass('public.employees') is not null then
    insert into schema_migrations (version) values ('0009_employees') on conflict do nothing;
    raise notice 'present, recorded: %', '0009_employees';
  else
    raise notice 'NOT present, left for install.sql: %', '0009_employees';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'departments_select') then
    insert into schema_migrations (version) values ('0010_employees_rls') on conflict do nothing;
    raise notice 'present, recorded: %', '0010_employees_rls';
  else
    raise notice 'NOT present, left for install.sql: %', '0010_employees_rls';
  end if;

  if to_regclass('public.attendance_records') is not null then
    insert into schema_migrations (version) values ('0011_attendance') on conflict do nothing;
    raise notice 'present, recorded: %', '0011_attendance';
  else
    raise notice 'NOT present, left for install.sql: %', '0011_attendance';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'geo_distance_m') then
    insert into schema_migrations (version) values ('0012_geofence') on conflict do nothing;
    raise notice 'present, recorded: %', '0012_geofence';
  else
    raise notice 'NOT present, left for install.sql: %', '0012_geofence';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'attendance_select_all') then
    insert into schema_migrations (version) values ('0013_attendance_rls') on conflict do nothing;
    raise notice 'present, recorded: %', '0013_attendance_rls';
  else
    raise notice 'NOT present, left for install.sql: %', '0013_attendance_rls';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'check_in') then
    insert into schema_migrations (version) values ('0014_attendance_actions') on conflict do nothing;
    raise notice 'present, recorded: %', '0014_attendance_actions';
  else
    raise notice 'NOT present, left for install.sql: %', '0014_attendance_actions';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'storage' and policyname = 'tenant reads its own private objects') then
    insert into schema_migrations (version) values ('0015_storage') on conflict do nothing;
    raise notice 'present, recorded: %', '0015_storage';
  else
    raise notice 'NOT present, left for install.sql: %', '0015_storage';
  end if;

  if to_regclass('public.tasks') is not null then
    insert into schema_migrations (version) values ('0016_tasks') on conflict do nothing;
    raise notice 'present, recorded: %', '0016_tasks';
  else
    raise notice 'NOT present, left for install.sql: %', '0016_tasks';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'is_assigned_to_me') then
    insert into schema_migrations (version) values ('0017_tasks_rls') on conflict do nothing;
    raise notice 'present, recorded: %', '0017_tasks_rls';
  else
    raise notice 'NOT present, left for install.sql: %', '0017_tasks_rls';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'field_visit_in_range') then
    insert into schema_migrations (version) values ('0018_field_visit_actions') on conflict do nothing;
    raise notice 'present, recorded: %', '0018_field_visit_actions';
  else
    raise notice 'NOT present, left for install.sql: %', '0018_field_visit_actions';
  end if;

  if to_regclass('public.leave_types') is not null then
    insert into schema_migrations (version) values ('0019_leave') on conflict do nothing;
    raise notice 'present, recorded: %', '0019_leave';
  else
    raise notice 'NOT present, left for install.sql: %', '0019_leave';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'working_days_between') then
    insert into schema_migrations (version) values ('0020_leave_actions') on conflict do nothing;
    raise notice 'present, recorded: %', '0020_leave_actions';
  else
    raise notice 'NOT present, left for install.sql: %', '0020_leave_actions';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'leave_types_select') then
    insert into schema_migrations (version) values ('0021_leave_rls') on conflict do nothing;
    raise notice 'present, recorded: %', '0021_leave_rls';
  else
    raise notice 'NOT present, left for install.sql: %', '0021_leave_rls';
  end if;

  if to_regclass('public.statutory_rates') is not null then
    insert into schema_migrations (version) values ('0022_payroll') on conflict do nothing;
    raise notice 'present, recorded: %', '0022_payroll';
  else
    raise notice 'NOT present, left for install.sql: %', '0022_payroll';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'calculate_paye_annual') then
    insert into schema_migrations (version) values ('0023_payroll_actions') on conflict do nothing;
    raise notice 'present, recorded: %', '0023_payroll_actions';
  else
    raise notice 'NOT present, left for install.sql: %', '0023_payroll_actions';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'statutory_rates_select') then
    insert into schema_migrations (version) values ('0024_payroll_rls') on conflict do nothing;
    raise notice 'present, recorded: %', '0024_payroll_rls';
  else
    raise notice 'NOT present, left for install.sql: %', '0024_payroll_rls';
  end if;

  if to_regclass('public.jobs') is not null then
    insert into schema_migrations (version) values ('0025_recruitment') on conflict do nothing;
    raise notice 'present, recorded: %', '0025_recruitment';
  else
    raise notice 'NOT present, left for install.sql: %', '0025_recruitment';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'apply_for_job') then
    insert into schema_migrations (version) values ('0026_recruitment_actions') on conflict do nothing;
    raise notice 'present, recorded: %', '0026_recruitment_actions';
  else
    raise notice 'NOT present, left for install.sql: %', '0026_recruitment_actions';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'jobs_public_read') then
    insert into schema_migrations (version) values ('0027_recruitment_rls') on conflict do nothing;
    raise notice 'present, recorded: %', '0027_recruitment_rls';
  else
    raise notice 'NOT present, left for install.sql: %', '0027_recruitment_rls';
  end if;

  if exists (select 1 from pg_attrdef d join pg_class c on c.oid = d.adrelid join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum where c.relname = 'tasks' and a.attname = 'reference') then
    insert into schema_migrations (version) values ('0028_create_paths') on conflict do nothing;
    raise notice 'present, recorded: %', '0028_create_paths';
  else
    raise notice 'NOT present, left for install.sql: %', '0028_create_paths';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'current_org_id') then
    insert into schema_migrations (version) values ('0029_audit_creates') on conflict do nothing;
    raise notice 'present, recorded: %', '0029_audit_creates';
  else
    raise notice 'NOT present, left for install.sql: %', '0029_audit_creates';
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and policyname = 'org_settings_update') then
    insert into schema_migrations (version) values ('0030_settings_scope') on conflict do nothing;
    raise notice 'present, recorded: %', '0030_settings_scope';
  else
    raise notice 'NOT present, left for install.sql: %', '0030_settings_scope';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'report_headcount') then
    insert into schema_migrations (version) values ('0031_reports') on conflict do nothing;
    raise notice 'present, recorded: %', '0031_reports';
  else
    raise notice 'NOT present, left for install.sql: %', '0031_reports';
  end if;

  if to_regclass('public.public_form_submissions') is not null then
    insert into schema_migrations (version) values ('0032_public_form_rate_limit') on conflict do nothing;
    raise notice 'present, recorded: %', '0032_public_form_rate_limit';
  else
    raise notice 'NOT present, left for install.sql: %', '0032_public_form_rate_limit';
  end if;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'enforce_high_risk_user_role') then
    insert into schema_migrations (version) values ('0033_high_risk_grants') on conflict do nothing;
    raise notice 'present, recorded: %', '0033_high_risk_grants';
  else
    raise notice 'NOT present, left for install.sql: %', '0033_high_risk_grants';
  end if;

  if to_regclass('public.if') is not null then
    insert into schema_migrations (version) values ('0034_hiring_pipeline') on conflict do nothing;
    raise notice 'present, recorded: %', '0034_hiring_pipeline';
  else
    raise notice 'NOT present, left for install.sql: %', '0034_hiring_pipeline';
  end if;

  if  then
    insert into schema_migrations (version) values ('0035_email_settings') on conflict do nothing;
    raise notice 'present, recorded: %', '0035_email_settings';
  else
    raise notice 'NOT present, left for install.sql: %', '0035_email_settings';
  end if;

  if to_regclass('public.conversations') is not null then
    insert into schema_migrations (version) values ('0036_messaging') on conflict do nothing;
    raise notice 'present, recorded: %', '0036_messaging';
  else
    raise notice 'NOT present, left for install.sql: %', '0036_messaging';
  end if;

end
$adopt$;

commit;
