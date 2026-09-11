-- RLS audit.
--
-- A structural sweep rather than a behavioural one: it inspects the catalog
-- for the shapes of mistake that are easy to make and hard to notice.
--
-- Plan reference: docs/PHASE_0_PLAN.md section 0.8, rule 5 — "No
-- `authenticated = true` policy on any sensitive table. Default deny."

set client_min_messages = notice;

do $$
declare
  offender text;
  n integer;
begin
  -- 1. Every table in public has RLS enabled. A new table added without it is
  --    readable by anyone signed in, to any tenant.
  select string_agg(c.relname, ', ') into offender
  from pg_class c
  join pg_namespace ns on ns.oid = c.relnamespace
  where ns.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  perform assert(offender is null,
    coalesce('Every public table has RLS enabled (missing: ' || offender || ')',
             'Every public table has RLS enabled'));

  -- 2. No permissive policy is unconditionally true for `authenticated`.
  --    This is the classic hole: a policy that looks like a policy but gates
  --    nothing.
  --
  --    Two exemptions, both named rather than pattern-matched, so adding a
  --    third is a deliberate act someone has to justify here:
  --
  --      auth_admin_*        the access token hook reads roles as
  --                          supabase_auth_admin, which no client can reach.
  --      permissions_select  `permissions` is the global permission
  --                          vocabulary — slug, module and description. It
  --                          holds no tenant data and no personal data, and
  --                          every signed-in user needs it to render the role
  --                          matrix. There is nothing here to scope by.
  select string_agg(schemaname || '.' || tablename || '.' || policyname, ', ')
    into offender
  from pg_policies
  where schemaname = 'public'
    and policyname not like 'auth_admin_%'
    and policyname <> 'permissions_select'
    and 'authenticated' = any(roles)
    and coalesce(qual, 'true') = 'true'
    and coalesce(with_check, 'true') = 'true';

  perform assert(offender is null,
    coalesce('No unconditional authenticated policy (found: ' || offender || ')',
             'No unconditional authenticated policy on any table'));

  -- 3. Every table holding organization_id gates on the caller's org somewhere
  --    in its policies. Tenant isolation is the outermost boundary; a table
  --    that forgets it leaks across tenants no matter what else it checks.
  select string_agg(t.tablename, ', ') into offender
  from (
    select c.relname as tablename
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid
    where ns.nspname = 'public' and c.relkind = 'r'
      and a.attname = 'organization_id' and a.attnum > 0 and not a.attisdropped
  ) t
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.tablename
      and (coalesce(p.qual, '') like '%current_org_id()%'
        or coalesce(p.with_check, '') like '%current_org_id()%')
  );

  perform assert(offender is null,
    coalesce('Every organization-owned table gates on current_org_id() (missing: ' || offender || ')',
             'Every organization-owned table gates on current_org_id()'));

  -- 4. anon holds no table privileges at all. Nothing in the workspace is
  --    public, so an anonymous caller should be refused before RLS is reached.
  select string_agg(distinct table_name, ', ') into offender
  from information_schema.role_table_grants
  where grantee = 'anon' and table_schema = 'public';

  perform assert(offender is null,
    coalesce('anon holds no privileges in public (found: ' || offender || ')',
             'anon holds no privileges on any public table'));

  -- 5. The audit log cannot be updated or deleted by anyone.
  select string_agg(grantee || ':' || privilege_type, ', ') into offender
  from information_schema.role_table_grants
  where table_name = 'audit_logs'
    and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')
    and grantee <> 'postgres';

  perform assert(offender is null,
    coalesce('audit_logs grants no mutation privilege (found: ' || offender || ')',
             'audit_logs grants no update, delete or truncate privilege'));

  select count(*) into n from pg_trigger
  where tgrelid = 'audit_logs'::regclass and not tgisinternal;
  perform assert(n >= 2, 'audit_logs carries triggers rejecting update and delete');

  -- 6. Helper functions pin search_path. Without it, a caller can shadow
  --    `public` and change what a security-definer function resolves to.
  select string_agg(p.proname, ', ') into offender
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and p.prosecdef
    and not exists (
      select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
      where cfg like 'search_path=%'
    );

  perform assert(offender is null,
    coalesce('Every security definer function pins search_path (missing: ' || offender || ')',
             'Every security definer function pins search_path'));

  raise notice '--- RLS audit passed ---';
end
$$;
