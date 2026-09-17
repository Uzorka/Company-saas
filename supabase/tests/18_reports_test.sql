-- Reporting aggregates.
--
-- The whole design of these functions is that they are SECURITY INVOKER, so a
-- single function answers differently for each caller because their own RLS
-- decides which rows it can see. That is the claim worth testing: if any of
-- them were made SECURITY DEFINER, every one of these assertions would still
-- "work" in the sense of returning numbers — the numbers would just be the
-- whole company's, handed to whoever asked.
--
-- Depends on fixtures from 10-17.

set client_min_messages = notice;

do $$
declare
  f record;
  org_a uuid;
  u_hod uuid;
  dept_sales uuid;
  mgmt_rows integer;
  hod_rows integer;
  emp_rows integer;
  mgmt_head bigint;
  hod_head bigint;
  n integer;
begin
  select * into f from fixture;
  org_a := f.org_a;
  select id into dept_sales from departments where code = 'DPT-SLS' and organization_id = org_a;
  select user_id into u_hod from department_heads where department_id = dept_sales;

  -- === Headcount ==========================================================
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, org_a)::text, true);
  set local role authenticated;
  select count(*), coalesce(sum(headcount), 0) into mgmt_rows, mgmt_head from report_headcount();
  reset role;

  perform assert(mgmt_rows > 0, 'Management gets a headcount report with departments in it');
  perform assert(mgmt_head > 0, 'Management sees a non-zero headcount');

  perform set_config('request.jwt.claims', claims_for(u_hod, org_a)::text, true);
  set local role authenticated;
  select count(*), coalesce(sum(headcount), 0) into hod_rows, hod_head from report_headcount();
  reset role;

  -- The HOD holds employees.view_department, so the employee side of the join
  -- is filtered to their department by policy — not by an argument, and not by
  -- a branch inside the function.
  perform assert(
    hod_head < mgmt_head,
    format('An HOD counts fewer people than Management (%s vs %s) — the function did not filter, their policy did',
           hod_head, mgmt_head)
  );

  -- === Attendance =========================================================
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, org_a)::text, true);
  set local role authenticated;
  select count(*) into mgmt_rows from report_attendance(current_date - 400, current_date + 1);
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select count(*) into emp_rows from report_attendance(current_date - 400, current_date + 1);
  reset role;

  perform assert(
    emp_rows <= mgmt_rows,
    'An employee''s attendance report covers no more days than Management''s'
  );

  -- The window is a real filter, not decoration.
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, org_a)::text, true);
  set local role authenticated;
  select count(*) into n from report_attendance(current_date + 300, current_date + 400);
  reset role;
  perform assert(n = 0, 'A window with no attendance in it reports nothing');

  -- === Leave ==============================================================
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, org_a)::text, true);
  set local role authenticated;
  select count(*) into n from report_leave(extract(year from current_date)::integer);
  reset role;
  perform assert(n > 0, 'The leave report lists every leave type, including ones with no requests');

  -- Days taken counts approved requests only — the same rule the balance
  -- follows, so a report and a balance never disagree.
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, org_a)::text, true);
  set local role authenticated;
  perform assert(
    (select coalesce(sum(days_taken), 0) from report_leave(1999)) = 0,
    'A year with no approved leave reports zero days taken'
  );
  reset role;

  -- === Payroll ============================================================
  -- Accounts and Management hold payroll.view_all; nobody else sees a line.
  perform set_config('request.jwt.claims', claims_for(f.u_acct, org_a)::text, true);
  set local role authenticated;
  select count(*) into mgmt_rows
    from report_payroll((select id from payroll_periods where organization_id = org_a limit 1));
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  select count(*) into emp_rows
    from report_payroll((select id from payroll_periods where organization_id = org_a limit 1));
  reset role;

  perform assert(emp_rows = 0,
    'HR gets an empty payroll report — they never see payroll figures, and a report is not an exception');

  raise notice '--- reporting assertions passed ---';
end
$$;

-- ---------------------------------------------------------------------------
-- Public form rate limiting.
--
-- apply_for_job() carried a comment claiming a rate limit that did not exist.
-- It exists now, and this is what stops it quietly becoming a comment again.
--
-- The form is the only unauthenticated write in the product, so these run as
-- `anon`, the way a visitor actually reaches it.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  org_a uuid;
  job_id uuid;
  n integer;
  ok boolean;
begin
  select * into f from fixture;
  org_a := f.org_a;

  select id into job_id from jobs
   where organization_id = org_a and status = 'published'
   order by created_at limit 1;

  perform assert(job_id is not null, 'There is a published job to apply to');

  -- Five from one source succeed.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  for n in 1..5 loop
    perform apply_for_job(job_id, 'Applicant', n::text,
      'flood' || n || '@example.com', null, null, null, null, 'test', 'source-alpha');
  end loop;
  reset role;

  perform assert(
    (select count(*) from job_applications where email like 'flood%@example.com') = 5,
    'Five applications from one source are accepted'
  );

  -- The sixth is refused.
  ok := true;
  begin
    perform set_config('request.jwt.claims', '{}', true);
    set local role anon;
    perform apply_for_job(job_id, 'Applicant', '6', 'flood6@example.com',
      null, null, null, null, 'test', 'source-alpha');
    reset role;
    ok := false;
  exception when check_violation then
    execute 'reset role';
  end;
  perform assert(ok, 'The sixth application from the same source in an hour is refused');

  perform assert(
    (select count(*) from job_applications where email = 'flood6@example.com') = 0,
    'The refused application was not written'
  );

  -- A different source is unaffected: the limit is per source, not a global
  -- shutter that one abuser can close on everyone.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  perform apply_for_job(job_id, 'Different', 'Person', 'elsewhere@example.com',
    null, null, null, null, 'test', 'source-beta');
  reset role;

  perform assert(
    (select count(*) from job_applications where email = 'elsewhere@example.com') = 1,
    'A different source still gets through'
  );

  -- No source key (a proxy stripping headers) falls back to the organization
  -- ceiling rather than handing one visitor everyone else's quota.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  perform apply_for_job(job_id, 'No', 'Headers', 'nokey@example.com',
    null, null, null, null, 'test', null);
  reset role;
  perform assert(
    (select count(*) from job_applications where email = 'nokey@example.com') = 1,
    'A submission with no source key is still accepted'
  );

  -- The ledger is not readable through the API. Someone who could read it
  -- would learn who has been applying and when.
  perform assert(
    denies('{}'::jsonb, 'select count(*) from public_form_submissions', 'anon'),
    'The rate-limit ledger is unreadable by anon'
  );
  perform assert(
    denies(claims_for(f.u_mgmt, org_a), 'select count(*) from public_form_submissions'),
    'The rate-limit ledger is unreadable even by Management'
  );

  raise notice '--- public form rate limit assertions passed ---';
end
$$;

-- ---------------------------------------------------------------------------
-- High-risk role grants need a second approver, wherever they are written.
--
-- enforce_second_approver() guarded role_grant_requests from the start, but
-- nothing required anyone to go through that table: roles.manage allowed a
-- direct insert into user_roles, so the control was advisory. Confirmed
-- bypassable against the running database before 0033 closed it.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  org_a uuid;
  r_mgmt uuid;
  r_hod uuid;
  ok boolean;
  n integer;
begin
  select * into f from fixture;
  org_a := f.org_a;
  select id into r_mgmt from roles where organization_id = org_a and slug = 'management';
  select id into r_hod  from roles where organization_id = org_a and slug = 'hod';

  perform assert(
    (select high_risk from roles where id = r_mgmt),
    'Management is flagged high risk'
  );
  perform assert(
    not (select high_risk from roles where id = r_hod),
    'Head of Department is not — the rule must not block ordinary grants'
  );

  -- The bypass, closed.
  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, org_a),
      format('insert into user_roles (organization_id, user_id, role_id) values (%L, %L, %L)',
             org_a, f.u_other, r_mgmt)
    ) = 0,
    'A high-risk role cannot be granted directly, even by roles.manage'
  );

  -- A non-high-risk role still goes through without ceremony.
  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, org_a),
      format('insert into user_roles (organization_id, user_id, role_id) values (%L, %L, %L)',
             org_a, f.u_other, r_hod)
    ) = 1,
    'An ordinary role is granted without a second approver'
  );

  -- The legitimate path: a request, approved by a second person, then the
  -- grant. Written as the table owner because the fixture has no third user
  -- holding roles.manage — the rule under test is the trigger, not the policy.
  insert into role_grant_requests
    (organization_id, target_user_id, role_id, status, reason,
     requested_by, second_approver_id, second_approved_at)
  values
    (org_a, f.u_other, r_mgmt, 'active',
     'Covering the MD during parental leave, agreed at the board meeting.',
     f.u_mgmt, f.u_hr, now());

  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, org_a),
      format('insert into user_roles (organization_id, user_id, role_id) values (%L, %L, %L)',
             org_a, f.u_other, r_mgmt)
    ) = 1,
    'With an approved request and a second approver, the grant goes through'
  );

  -- And the grant is on the record.
  select count(*) into n from audit_logs
   where organization_id = org_a and action = 'roles.grant';
  perform assert(n >= 1, 'Granting a role is audited');

  raise notice '--- high-risk grant assertions passed ---';
end
$$;


-- ---------------------------------------------------------------------------
-- The two-stage grant path itself.
--
-- 0033 made the high-risk guard real; these assert the route through it that
-- the Role grants screen drives. Each rule is checked where it is enforced —
-- a CHECK constraint, a trigger and a policy — rather than in the action that
-- calls them, so the guarantee survives a rewrite of that action.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  org_a uuid;
  r_hr uuid;
  req uuid;
  failed boolean;
begin
  select * into f from fixture;
  org_a := f.org_a;
  select id into r_hr from roles where organization_id = org_a and slug = 'hr';

  -- A request that has not been approved grants nothing.
  insert into role_grant_requests
    (organization_id, target_user_id, role_id, status, reason, requested_by)
  values
    (org_a, f.u_emp, r_hr, 'awaiting_second_approver',
     'Taking over payroll administration from the end of the quarter.',
     f.u_mgmt)
  returning id into req;

  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, org_a),
      format('insert into user_roles (organization_id, user_id, role_id) values (%L, %L, %L)',
             org_a, f.u_emp, r_hr)
    ) = 0,
    'A request awaiting approval does not let the grant through'
  );

  -- It cannot become active without naming an approver.
  failed := false;
  begin
    update role_grant_requests set status = 'active' where id = req;
  exception when others then
    failed := true;
  end;
  perform assert(failed, 'A request cannot go active with no second approver');

  -- Nor can the person who raised it approve their own request.
  failed := false;
  begin
    update role_grant_requests
       set status = 'active', second_approver_id = f.u_mgmt, second_approved_at = now()
     where id = req;
  exception when others then
    failed := true;
  end;
  perform assert(failed, 'The requester cannot be their own second approver');

  -- Approved by a second person, the grant goes through.
  update role_grant_requests
     set status = 'active', second_approver_id = f.u_hr, second_approved_at = now()
   where id = req;

  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, org_a),
      format('insert into user_roles (organization_id, user_id, role_id) values (%L, %L, %L)',
             org_a, f.u_emp, r_hr)
    ) = 1,
    'Approved by a second person, the high-risk grant is written'
  );

  -- And someone without roles.manage cannot raise a request at all, so the
  -- screen is not the thing keeping them out.
  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, org_a),
      format($q$insert into role_grant_requests
                  (organization_id, target_user_id, role_id, status, reason, requested_by)
                values (%L, %L, %L, 'awaiting_second_approver', 'Promoting myself, thanks.', %L)$q$,
             org_a, f.u_emp, r_hr, f.u_emp)
    ) = 0,
    'Raising a grant request needs roles.manage'
  );

  raise notice '--- grant path assertions passed ---';
end
$$;


-- ---------------------------------------------------------------------------
-- The first administrator has to come from outside the app.
--
-- The 0033 guard returns early when there is no JWT claim, which is what makes
-- the bootstrap documented in supabase/seed.sql work: an operator running SQL
-- in their own dashboard can create the first Management account, because
-- there is nobody yet to be the second approver.
--
-- Asserted rather than assumed. "Hardening" the trigger to fire with null
-- claims would leave a correct-looking rule and a product that cannot be set
-- up at all — the failure would appear only on a fresh install.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  r_mgmt uuid;
  n integer;
begin
  select * into f from fixture;
  select id into r_mgmt from roles where organization_id = f.org_a and slug = 'management';

  perform set_config('request.jwt.claims', '', true);
  perform assert(current_org_id() is null, 'No claims means no current organization');

  insert into user_roles (organization_id, user_id, role_id)
  values (f.org_a, f.u_acct, r_mgmt);
  get diagnostics n = row_count;

  perform assert(n = 1, 'The dashboard bootstrap can create the first administrator');

  delete from user_roles
   where organization_id = f.org_a and user_id = f.u_acct and role_id = r_mgmt;

  raise notice '--- bootstrap assertions passed ---';
end
$$;


-- ---------------------------------------------------------------------------
-- Who the hiring emails come from.
--
-- The address is tenant configuration, not a server secret, so it lives in
-- settings and an administrator changes it without a deploy. That puts it
-- behind `org_settings_update`, which since 0030 means `settings.manage` and
-- nothing weaker — HR runs hiring but does not get to decide what address the
-- company's mail appears to come from.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  select * into f from fixture;

  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, f.org_a),
      format('update organization_settings set email_from_address = %L where organization_id = %L',
             'recruitment@example.com', f.org_a)
    ) = 1,
    'Management can set the sending address'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, f.org_a),
      format('update organization_settings set email_from_address = %L where organization_id = %L',
             'hr-pretending@example.com', f.org_a)
    ) = 0,
    'HR runs hiring but does not choose what address it comes from'
  );

  perform assert(
    (select email_from_address from organization_settings where organization_id = f.org_a)
      = 'recruitment@example.com',
    'and the address is unchanged afterwards'
  );

  -- A blank string is not an address. The column refuses it, so a cleared form
  -- field has to arrive as null rather than as empty text the provider would
  -- reject at send time.
  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, f.org_a),
      format('update organization_settings set email_from_address = %L where organization_id = %L',
             '', f.org_a)
    ) = 0,
    'An empty string is refused as a sending address'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, f.org_a),
      format('update organization_settings set email_from_address = null where organization_id = %L',
             f.org_a)
    ) = 1,
    'but clearing it to null is allowed — that is how sending is turned off'
  );

  raise notice '--- email settings assertions passed ---';
end
$$;
