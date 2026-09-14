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
