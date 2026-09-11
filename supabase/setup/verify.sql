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

  union all select 6, 'Audit log is append-only',
    case when exists (select 1 from information_schema.role_table_grants
      where table_name = 'audit_logs' and privilege_type in ('UPDATE','DELETE')
        and grantee <> 'postgres')
      then 'MUTABLE — investigate' else 'no update/delete granted' end,
    not exists (select 1 from information_schema.role_table_grants
      where table_name = 'audit_logs' and privilege_type in ('UPDATE','DELETE')
        and grantee <> 'postgres')

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
)
select
  case when ok then 'PASS' else 'FAIL' end as result,
  check_name as "check",
  detail
from checks
order by ord;
