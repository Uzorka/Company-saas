-- ===========================================================================
-- Post-install verification.
--
-- Paste into the Supabase SQL editor AFTER running install.sql, seed.sql, and
-- registering the access token hook. Every row should read PASS.
--
-- Copy the whole result table back to Claude — it says exactly which step is
-- incomplete, and contains no secrets: only counts and yes/no answers.
-- ===========================================================================

with checks as (

  select 1::numeric as ord, 'Tables created' as check_name,
    (select count(*) from pg_tables where schemaname = 'public')::text || ' tables' as detail,
    (select count(*) from pg_tables where schemaname = 'public') >= 12 as ok

  union all select 2, 'RLS enabled on every public table',
    coalesce((select string_agg(c.relname, ', ') from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
      'all enabled'),
    not exists (select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity)

  union all select 3, 'Permission catalogue loaded',
    (select count(*) from permissions)::text || ' permissions',
    (select count(*) from permissions) >= 60

  union all select 4, 'Access token hook exists',
    coalesce((select 'present' from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'custom_access_token_hook' limit 1),
      'MISSING — re-run install.sql'),
    exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'custom_access_token_hook')

  union all select 5, 'Hook is executable by the auth service',
    case when has_function_privilege('supabase_auth_admin',
      'public.custom_access_token_hook(jsonb)', 'execute')
      then 'granted' else 'NOT GRANTED' end,
    has_function_privilege('supabase_auth_admin',
      'public.custom_access_token_hook(jsonb)', 'execute')

  -- Scoped to the roles an application request can actually run as. Platform
  -- roles (postgres, supabase_admin, dashboard_user) keep their grants so the
  -- dashboard tooling works, and the trigger below refuses them anyway.
  union all select 6, 'No app role can mutate the audit log',
    coalesce((select string_agg(distinct grantee || ':' || privilege_type, ', ')
      from information_schema.role_table_grants
      where table_name = 'audit_logs'
        and privilege_type in ('UPDATE','DELETE','TRUNCATE')
        and grantee in ('anon','authenticated','service_role')),
      'anon, authenticated and service_role all revoked'),
    not exists (select 1 from information_schema.role_table_grants
      where table_name = 'audit_logs'
        and privilege_type in ('UPDATE','DELETE','TRUNCATE')
        and grantee in ('anon','authenticated','service_role'))

  -- The guarantee that does not depend on grants at all.
  union all select 6.1, 'Audit trigger refuses updates and deletes',
    (select count(*)::text || ' guard trigger(s)' from pg_trigger
      where tgrelid = 'audit_logs'::regclass and not tgisinternal),
    (select count(*) from pg_trigger
      where tgrelid = 'audit_logs'::regclass and not tgisinternal) >= 2

  union all select 7, 'Seed tenant present',
    coalesce((select name || ' (' || slug || ')' from organizations limit 1),
             'none — run seed.sql'),
    exists (select 1 from organizations)

  union all select 8, 'Five default roles provisioned',
    coalesce((select string_agg(slug, ', ' order by slug) from roles), 'none'),
    (select count(*) from roles) >= 5

  union all select 9, 'HR holds no payroll permission',
    coalesce((select string_agg(rp.permission_slug, ', ') from roles r
      join role_permissions rp on rp.role_id = r.id
      where r.slug = 'hr' and rp.permission_slug like 'payroll%'),
      'none — correct'),
    not exists (select 1 from roles r join role_permissions rp on rp.role_id = r.id
      where r.slug = 'hr' and rp.permission_slug like 'payroll%')

  union all select 10, 'Accounts holds no recruitment permission',
    coalesce((select string_agg(rp.permission_slug, ', ') from roles r
      join role_permissions rp on rp.role_id = r.id
      where r.slug = 'accounts' and rp.permission_slug like 'recruitment%'),
      'none — correct'),
    not exists (select 1 from roles r join role_permissions rp on rp.role_id = r.id
      where r.slug = 'accounts' and rp.permission_slug like 'recruitment%')

  union all select 10.1, 'Departments seeded',
    (select count(*) from departments)::text || ' departments',
    (select count(*) from departments) >= 7

  union all select 10.2, 'Positions seeded',
    (select count(*) from positions)::text || ' positions',
    (select count(*) from positions) >= 20

  union all select 10.3, 'Shift patterns seeded',
    (select count(*) from shift_patterns)::text || ' patterns',
    (select count(*) from shift_patterns) >= 3

  union all select 10.4, 'Salary is a separate table from employees',
    case when exists (select 1 from information_schema.columns
      where table_name = 'employees' and column_name like '%salary%')
      then 'SALARY COLUMN ON employees — investigate'
      else 'employee_compensation only' end,
    not exists (select 1 from information_schema.columns
      where table_name = 'employees' and column_name like '%salary%')

  union all select 11, 'Your account is attached to the tenant',
    coalesce((select count(*)::text || ' member(s)' from organization_members
      where status = 'active'), '0'),
    (select count(*) from organization_members where status = 'active') > 0

  union all select 12, 'At least one user has a role',
    (select count(*) from user_roles)::text || ' role assignment(s)',
    (select count(*) from user_roles) > 0

  -- The check that matters most, and the one that was missing.
  --
  -- Confirming the hook function EXISTS is not the same as confirming it
  -- RUNS: a function with a bad variable reference is created cleanly and
  -- only fails when called. So this actually invokes it with a real user and
  -- inspects the token it produces. If this row says PASS, sign-in works.
  union all select 13, 'Access token hook runs and stamps a company',
    coalesce((
      select 'company + ' || jsonb_array_length(c -> 'permissions')::text || ' permissions'
      from (
        select custom_access_token_hook(jsonb_build_object(
          'user_id', (select user_id from user_roles limit 1),
          'claims', '{}'::jsonb
        )) -> 'claims' as c
      ) t
      where c ->> 'organization_id' is not null
    ), 'HOOK RETURNED NO COMPANY — sign-in would show empty pages'),
    coalesce((
      select (c ->> 'organization_id') is not null
         and jsonb_array_length(c -> 'permissions') > 0
      from (
        select custom_access_token_hook(jsonb_build_object(
          'user_id', (select user_id from user_roles limit 1),
          'claims', '{}'::jsonb
        )) -> 'claims' as c
      ) t
    ), false)

  union all select 14, 'That user''s roles are in the token',
    coalesce((
      select (c -> 'roles')::text
      from (
        select custom_access_token_hook(jsonb_build_object(
          'user_id', (select user_id from user_roles limit 1),
          'claims', '{}'::jsonb
        )) -> 'claims' as c
      ) t
    ), 'none'),
    coalesce((
      select jsonb_array_length(c -> 'roles') > 0
      from (
        select custom_access_token_hook(jsonb_build_object(
          'user_id', (select user_id from user_roles limit 1),
          'claims', '{}'::jsonb
        )) -> 'claims' as c
      ) t
    ), false)

  -- === Added after the Phase 4 install was found to be 14 migrations behind ===
  -- These cover everything built in Phases 5-8. The original checks stopped at
  -- Phase 4, so a database missing tasks, leave, payroll and recruitment
  -- entirely still reported all-PASS.

  -- Reports rather than asserts a number: hardcoding "of 28" here means this
  -- file needs editing every time a migration is added, and a check that goes
  -- stale silently is worse than one that states what it found. Completeness
  -- is proved by 16 and 17 below, which name actual objects.
  union all select 15, 'Migration ledger',
    coalesce((select count(*)::text || ' recorded, latest ' || max(version)
      from schema_migrations), 'EMPTY — run adopt.sql then install.sql'),
    coalesce((select count(*) from schema_migrations), 0) > 0

  union all select 16, 'Phase 5-8 tables present',
    coalesce(nullif((select string_agg(t, ', ') from unnest(array[
      'tasks','field_visits','leave_requests','leave_balances',
      'payroll_periods','payroll_run_lines','payslips','jobs','job_applications'
    ]) t where to_regclass('public.' || t) is null), ''),
      'all present'),
    not exists (select 1 from unnest(array[
      'tasks','field_visits','leave_requests','leave_balances',
      'payroll_periods','payroll_run_lines','payslips','jobs','job_applications'
    ]) t where to_regclass('public.' || t) is null)

  union all select 17, 'Task references are allocated by the database',
    case when exists (
      select 1 from pg_attrdef d
      join pg_class c on c.oid = d.adrelid
      join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
      where c.relname = 'tasks' and a.attname = 'reference')
    then 'default set' else 'MISSING — migration 0028 has not run' end,
    exists (
      select 1 from pg_attrdef d
      join pg_class c on c.oid = d.adrelid
      join pg_attribute a on a.attrelid = c.oid and a.attnum = d.adnum
      where c.relname = 'tasks' and a.attname = 'reference')

  union all select 18, 'Leave types seeded',
    coalesce((select count(*)::text from leave_types), '0') || ' types',
    coalesce((select count(*) from leave_types), 0) > 0

  union all select 19, 'Payroll reference data seeded',
    coalesce((select count(*)::text from paye_bands), '0') || ' PAYE bands, ' ||
    coalesce((select count(*)::text from statutory_rates), '0') || ' statutory rates',
    coalesce((select count(*) from paye_bands), 0) > 0
      and coalesce((select count(*) from statutory_rates), 0) > 0

  union all select 20, 'Storage policies installed',
    coalesce((select count(*)::text from pg_policies where schemaname = 'storage'), '0')
      || ' policies on storage.objects',
    (select count(*) from pg_policies where schemaname = 'storage') >= 3

  union all select 21, 'RLS policies across the app',
    (select count(*) from pg_policies where schemaname = 'public')::text || ' policies',
    (select count(*) from pg_policies where schemaname = 'public') >= 100
)
select
  case when ok then 'PASS' else 'FAIL' end as result,
  check_name as "check",
  detail
from checks
order by ord;
