-- RLS test suite.
--
-- These run as the `authenticated` role with a JWT claim set the way PostgREST
-- sets it per request, so what passes here is what the policies actually do —
-- not what they look like they do.
--
-- Every assertion states the rule it is defending in plain words, because a
-- failure here means a tenant-isolation or permission regression, and whoever
-- sees it next needs to know what broke without reading the policy.

\set ON_ERROR_STOP on
\pset pager off
-- Notices carry the assertion results, so they must not be filtered out.
set client_min_messages = notice;

create or replace function assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition then
    raise notice 'PASS  %', description;
  else
    raise exception 'FAIL  %', description;
  end if;
end;
$$;

-- Run `body` with the given claims, as the given database role, and report
-- whether it was refused. Two gates are being tested here: table privileges
-- (a hard permission denied) and RLS policies (a row simply not matching), so
-- both error classes count as a denial.
create or replace function denies(claims jsonb, body text, as_role text default 'authenticated')
returns boolean language plpgsql as $$
begin
  perform set_config('request.jwt.claims', claims::text, true);
  execute format('set local role %I', as_role);
  execute body;
  execute 'reset role';
  return false;
exception when insufficient_privilege or check_violation then
  execute 'reset role';
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: two tenants, so isolation can actually be tested rather than
-- assumed. Built as the owner, with RLS bypassed, before any policy applies.
-- ---------------------------------------------------------------------------
do $$
declare
  org_a uuid; org_b uuid;
  u_mgmt uuid; u_hr uuid; u_acct uuid; u_emp uuid; u_other uuid;
begin
  insert into organizations (name, slug, status) values ('CHF Heron Nigeria', 'chfheron', 'active') returning id into org_a;
  insert into organizations (name, slug, status) values ('Sahel Foods Ltd.', 'sahelfoods', 'active') returning id into org_b;
  insert into organization_settings (organization_id) values (org_a), (org_b);

  perform provision_default_roles(org_a);
  perform provision_default_roles(org_b);

  insert into auth.users (email) values ('ngozi@chfheron.com')  returning id into u_mgmt;
  insert into auth.users (email) values ('amaka@chfheron.com')  returning id into u_hr;
  insert into auth.users (email) values ('ifeoma@chfheron.com') returning id into u_acct;
  insert into auth.users (email) values ('chidi@chfheron.com')  returning id into u_emp;
  insert into auth.users (email) values ('rival@sahelfoods.com') returning id into u_other;

  insert into organization_members (organization_id, user_id, status) values
    (org_a, u_mgmt, 'active'), (org_a, u_hr, 'active'),
    (org_a, u_acct, 'active'), (org_a, u_emp, 'active'),
    (org_b, u_other, 'active');

  insert into user_roles (organization_id, user_id, role_id)
  select org_a, u_mgmt, id from roles where organization_id = org_a and slug = 'management';
  insert into user_roles (organization_id, user_id, role_id)
  select org_a, u_hr, id from roles where organization_id = org_a and slug = 'hr';
  insert into user_roles (organization_id, user_id, role_id)
  select org_a, u_acct, id from roles where organization_id = org_a and slug = 'accounts';
  insert into user_roles (organization_id, user_id, role_id)
  select org_a, u_emp, id from roles where organization_id = org_a and slug = 'employee';
  insert into user_roles (organization_id, user_id, role_id)
  select org_b, u_other, id from roles where organization_id = org_b and slug = 'management';

  insert into offices (organization_id, name, latitude, longitude, geofence_radius_m)
  values (org_a, 'Head Office, Victoria Island', 6.4312, 3.4219, 150),
         (org_b, 'Kano plant', 12.0022, 8.5920, 200);

  create temp table fixture as
    select org_a as org_a, org_b as org_b, u_mgmt as u_mgmt, u_hr as u_hr,
           u_acct as u_acct, u_emp as u_emp, u_other as u_other;
end
$$;

-- How many rows did this statement actually change, running as `as_role`?
--
-- Needed because RLS refuses a write in two different ways. Missing a table
-- privilege raises; a policy that simply matches no rows does not — the
-- statement succeeds having changed nothing. Both are correct outcomes, but
-- only denies() sees the first, so asserting a write was refused with
-- denies() alone gives a false pass on the second.
--
-- Assert on the effect instead: zero rows changed is the guarantee.
create or replace function rows_changed_by(
  claims jsonb, statement text, as_role text default 'authenticated'
)
returns integer language plpgsql as $$
declare n integer;
begin
  perform set_config('request.jwt.claims', claims::text, true);
  execute format('set local role %I', as_role);
  execute statement;
  get diagnostics n = row_count;
  execute 'reset role';
  return n;
exception when insufficient_privilege or check_violation then
  execute 'reset role';
  return 0;  -- refused outright, which is also zero rows changed
end;
$$;

-- Build a claims blob the way the access token hook would, for a given user.
create or replace function claims_for(p_user uuid, p_org uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'sub', p_user,
    'role', 'authenticated',
    'organization_id', p_org,
    'permissions', coalesce((
      select jsonb_agg(distinct rp.permission_slug)
      from user_roles ur
      join role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = p_user and ur.organization_id = p_org
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- The assertions. From here on we act as `authenticated`, exactly as a
-- request from the app does.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  n integer;
  ok boolean;
begin
  select * into f from fixture;

  -- === Tenant isolation ===================================================
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
  set local role authenticated;

  select count(*) into n from organizations;
  perform assert(n = 1, 'Management sees exactly one organization — their own');

  select count(*) into n from organizations where id = f.org_b;
  perform assert(n = 0, 'Organization A cannot see Organization B, even as Management');

  select count(*) into n from offices;
  perform assert(n = 1, 'Offices are scoped to the tenant');

  reset role;
  perform set_config('request.jwt.claims', claims_for(f.u_other, f.org_b)::text, true);
  set local role authenticated;
  select count(*) into n from offices;
  perform assert(n = 1, 'The other tenant sees only its own office');
  select count(*) into n from offices where organization_id = f.org_a;
  perform assert(n = 0, 'Tenant B cannot read Tenant A offices');
  reset role;

  -- === HR has no payroll access ===========================================
  -- The single most load-bearing row of the matrix: HR owns people data and
  -- must never see salary figures.
  perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
  set local role authenticated;
  perform assert(not has_permission('payroll.view_all'), 'HR cannot view payroll');
  perform assert(not has_permission('payroll.approve'),  'HR cannot approve payroll');
  perform assert(not has_permission('payroll.publish'),  'HR cannot publish payslips');
  perform assert(not has_permission('audit.view'),       'HR cannot read the audit log');
  -- Settings is "Some areas", scoped by subject: HR owns structure, Accounts
  -- owns payroll rates, and neither may open the other's.
  perform assert(has_permission('settings.manage_structure'), 'HR owns departments and leave types');
  perform assert(not has_permission('settings.manage_payroll'), 'HR cannot change payroll rates');
  perform assert(not has_permission('settings.manage'), 'HR does not hold full settings access');
  perform assert(has_permission('employees.view_all'),   'HR can see every employee');
  perform assert(has_permission('recruitment.view'),     'HR can see recruitment');
  reset role;

  -- === Accounts does not inherit HR =======================================
  perform set_config('request.jwt.claims', claims_for(f.u_acct, f.org_a)::text, true);
  set local role authenticated;
  perform assert(has_permission('payroll.view_all'),          'Accounts can view payroll');
  perform assert(not has_permission('recruitment.view'),      'Accounts cannot see recruitment');
  perform assert(not has_permission('leave.approve_hr'),      'Accounts cannot give HR leave approval');
  perform assert(not has_permission('employees.create'),      'Accounts cannot create employees');
  perform assert(not has_permission('audit.view'),            'Accounts cannot read the audit log');
  perform assert(has_permission('settings.manage_payroll'),   'Accounts owns payroll rates');
  perform assert(not has_permission('settings.manage_structure'), 'Accounts cannot change departments or leave types');
  perform assert(not has_permission('settings.manage'),       'Accounts does not hold full settings access');
  reset role;

  -- === Employee: own only is a different scope, not a weaker read =========
  perform set_config('request.jwt.claims', claims_for(f.u_emp, f.org_a)::text, true);
  set local role authenticated;
  perform assert(has_permission('payroll.view_self'),      'Employee can see their own payslips');
  perform assert(not has_permission('payroll.view_all'),   'Employee cannot see anyone else''s payroll');
  perform assert(has_permission('attendance.view_self'),   'Employee can see their own attendance');
  perform assert(not has_permission('attendance.view_all'),'Employee cannot see everyone''s attendance');
  perform assert(not has_permission('employees.view_all'), 'Employee cannot browse the directory');
  perform assert(has_permission('attendance.check_in'),    'Employee can check themselves in');

  select count(*) into n from roles;
  perform assert(n = 0, 'Employee cannot enumerate roles — no roles.view');
  reset role;

  -- === Only Management reads the audit log ================================
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
  set local role authenticated;
  perform assert(has_permission('audit.view'), 'Management can read the audit log');
  reset role;

  -- === Audit entries are immutable, for everyone ==========================
  insert into audit_logs (organization_id, action, entity_type, entity_id)
  values (f.org_a, 'test.seed', 'test', '1');

  ok := denies(
    claims_for(f.u_mgmt, f.org_a),
    'update audit_logs set action = ''tampered'' where action = ''test.seed'''
  );
  perform assert(ok, 'Audit entries cannot be updated — not even by Management');

  ok := denies(
    claims_for(f.u_mgmt, f.org_a),
    'delete from audit_logs where action = ''test.seed'''
  );
  perform assert(ok, 'Audit entries cannot be deleted — not even by Management');

  -- === A tenant cannot read another tenant's audit log ====================
  perform set_config('request.jwt.claims', claims_for(f.u_other, f.org_b)::text, true);
  set local role authenticated;
  select count(*) into n from audit_logs;
  perform assert(n = 0, 'Tenant B sees none of Tenant A''s audit entries');
  reset role;

  -- === write_audit takes the org from the claim, not from an argument =====
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, f.org_a)::text, true);
  set local role authenticated;
  perform write_audit('role.grant', 'user', 'abc', '{"role":"accounts"}'::jsonb);
  select count(*) into n from audit_logs where action = 'role.grant';
  perform assert(n = 1, 'write_audit records an entry scoped to the caller''s tenant');
  reset role;

  -- === Unscoped sessions see nothing ======================================
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', f.u_mgmt, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform assert(current_org_id() is null, 'A session with no org claim has no organization');
  select count(*) into n from organizations;
  perform assert(n = 0, 'A session with no org claim reads no organizations');
  select count(*) into n from offices;
  perform assert(n = 0, 'A session with no org claim reads no offices');
  reset role;

  -- === Anonymous is refused outright ======================================
  -- Stronger than reading zero rows: anon holds no table privilege at all, so
  -- the statement is rejected before RLS is even consulted.
  ok := denies('{}'::jsonb, 'select count(*) from organizations', 'anon');
  perform assert(ok, 'An anonymous caller cannot read organizations at all');

  ok := denies('{}'::jsonb, 'select count(*) from audit_logs', 'anon');
  perform assert(ok, 'An anonymous caller cannot read the audit log at all');

  -- === The workspace picker still works before an org is chosen ===========
  -- members_select_self is deliberately not org-scoped, or a user with several
  -- memberships could never pick one.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', f.u_hr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from organization_members;
  perform assert(n = 1, 'A user can list their own memberships before choosing a workspace');
  reset role;

  raise notice '--- all RLS assertions passed ---';
end
$$;
