-- Leave workflow.
--
-- The rule under test: a balance moves ONLY on final approval. Deducting at
-- submission would make a declined request cost the employee days; deducting
-- at HOD approval would strand them if HR declines.
--
-- Depends on fixtures from 10-13.

set client_min_messages = notice;

do $$
declare
  f record;
  org_a uuid;
  dept_sales uuid;
  u_hod uuid;
  emp_chidi uuid;
  t_annual uuid; t_sick uuid; t_unpaid uuid;
  r leave_requests;
  n integer;
  remaining numeric;
begin
  select * into f from fixture;
  org_a := f.org_a;
  select id into dept_sales from departments where code = 'DPT-SLS' and organization_id = org_a;
  select user_id into u_hod from department_heads where department_id = dept_sales;
  select id into emp_chidi from employees where employee_no = 'EMP-0142';

  insert into leave_types (organization_id, name, annual_entitlement_days, document_required_after_days, paid)
  values (org_a, 'Annual leave', 20, null, true) returning id into t_annual;
  insert into leave_types (organization_id, name, annual_entitlement_days, document_required_after_days, paid)
  values (org_a, 'Sick leave', 10, 3, true) returning id into t_sick;
  insert into leave_types (organization_id, name, annual_entitlement_days, paid)
  values (org_a, 'Unpaid leave', null, false) returning id into t_unpaid;

  insert into leave_balances (organization_id, employee_id, leave_type_id, leave_year, entitled_days)
  values (org_a, emp_chidi, t_annual, 2026, 20),
         (org_a, emp_chidi, t_sick, 2026, 10);

  -- === Working days exclude weekends ======================================
  -- Mon 2026-03-02 to Fri 2026-03-06 is five days, not seven.
  perform assert(working_days_between(date '2026-03-02', date '2026-03-06') = 5,
    'A Monday-to-Friday range counts as five working days');
  perform assert(working_days_between(date '2026-03-02', date '2026-03-08') = 5,
    'A range spanning the weekend still counts five working days');

  -- === Submission routes to the HOD =======================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into r from submit_leave_request(t_annual, date '2026-03-02', date '2026-03-06',
    'Family visit to Enugu.');
  perform assert(r.status = 'pending_hod',
    'A request from someone with a head of department goes to them first');
  perform assert(r.days_requested = 5, 'The day count is computed, not supplied');
  reset role;

  -- === The balance has NOT moved yet ======================================
  perform assert(leave_days_remaining(emp_chidi, t_annual, 2026::smallint) = 20,
    'Submitting does not touch the balance');

  -- === HR cannot jump the queue ===========================================
  perform assert(
    denies(claims_for(f.u_hr, org_a),
      'select decide_leave_request(''' || r.id || ''', true)'),
    'HR cannot approve a request still waiting on the HOD');

  -- === The employee cannot approve their own ==============================
  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'select decide_leave_request(''' || r.id || ''', true)'),
    'An employee cannot approve their own leave');

  -- === HOD approves; still not deducted ===================================
  perform set_config('request.jwt.claims', claims_for(u_hod, org_a)::text, true);
  set local role authenticated;
  select * into r from decide_leave_request(r.id, true, 'Cover arranged with Adaeze.');
  perform assert(r.status = 'pending_hr', 'HOD approval advances the request to HR');
  reset role;

  perform assert(leave_days_remaining(emp_chidi, t_annual, 2026::smallint) = 20,
    'HOD approval still does not touch the balance — HR may yet decline');

  -- === HR approves; NOW it is deducted ====================================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  select * into r from decide_leave_request(r.id, true);
  perform assert(r.status = 'approved', 'HR approval grants the leave');
  reset role;

  perform assert(leave_days_remaining(emp_chidi, t_annual, 2026::smallint) = 15,
    'The balance moves only on final approval — 20 days less 5 taken');

  -- === Both decisions are kept ============================================
  select count(*) into n from leave_approvals where leave_request_id = r.id;
  perform assert(n = 2, 'Both stages are recorded in the approval history');

  -- === A declined request costs nothing ===================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into r from submit_leave_request(t_annual, date '2026-04-06', date '2026-04-10');
  reset role;

  perform assert(
    denies(claims_for(u_hod, org_a),
      'select decide_leave_request(''' || r.id || ''', false, ''no'')'),
    'Declining with a two-word reason is refused');

  perform set_config('request.jwt.claims', claims_for(u_hod, org_a)::text, true);
  set local role authenticated;
  select * into r from decide_leave_request(r.id, false,
    'Stock-take week — please move this to the following month.');
  perform assert(r.status = 'declined', 'An HOD can decline with a reason');
  reset role;

  perform assert(leave_days_remaining(emp_chidi, t_annual, 2026::smallint) = 15,
    'A declined request costs the employee nothing');

  -- === Insufficient balance blocks submission =============================
  -- 15 days left; asking for 20 working days.
  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'select submit_leave_request(''' || t_annual || ''', date ''2026-06-01'', date ''2026-06-26'')'),
    'A request larger than the remaining balance is refused at submission');

  -- === Uncapped types are not balance-checked =============================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into r from submit_leave_request(t_unpaid, date '2026-07-01', date '2026-07-31');
  perform assert(r.status = 'pending_hod',
    'Unpaid leave has no cap, so a long request is accepted for approval');
  reset role;

  -- === Sick leave over three days needs a document ========================
  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'select submit_leave_request(''' || t_sick || ''', date ''2026-05-04'', date ''2026-05-08'')'),
    'Sick leave over three days is refused without a supporting document');

  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into r from submit_leave_request(t_sick, date '2026-05-04', date '2026-05-08',
    'Flu', 'employee-documents/cert.pdf');
  perform assert(r.status = 'pending_hod',
    'The same request is accepted once a certificate is attached');

  -- === Cancel while pending, not after approval ===========================
  select * into r from cancel_leave_request(r.id);
  perform assert(r.status = 'cancelled', 'An employee can withdraw a pending request');
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into r from submit_leave_request(t_annual, date '2026-08-03', date '2026-08-04');
  reset role;
  perform set_config('request.jwt.claims', claims_for(u_hod, org_a)::text, true);
  set local role authenticated;
  perform decide_leave_request(r.id, true);
  reset role;
  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  perform decide_leave_request(r.id, true);
  reset role;

  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'select cancel_leave_request(''' || r.id || ''')'),
    'An approved request cannot be cancelled — that is a new request');

  -- === Direct writes are impossible =======================================
  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'update leave_requests set status = ''approved'' where id = ''' || r.id || ''''),
    'An employee cannot approve leave with a direct update — no update policy exists');

  remaining := leave_days_remaining(emp_chidi, t_annual, 2026::smallint);

  -- Asserted on the effect rather than on an exception. leave_balances does
  -- carry an UPDATE grant (HR needs it), so an employee's attempt is filtered
  -- by policy to zero rows rather than refused outright: it succeeds having
  -- changed nothing. Checking for a raise here passed for the wrong reason.
  perform assert(
    rows_changed_by(claims_for(f.u_emp, org_a),
      'update leave_balances set taken_days = 0 where employee_id = ''' || emp_chidi || '''') = 0,
    'An employee cannot change their own balance — no rows are affected');

  perform assert(leave_days_remaining(emp_chidi, t_annual, 2026::smallint) = remaining,
    'And the balance is genuinely unchanged afterwards');

  -- === Scope ==============================================================
  perform set_config('request.jwt.claims', claims_for(f.u_other, f.org_b)::text, true);
  set local role authenticated;
  perform assert((select count(*) from leave_requests) = 0,
    'Another tenant sees no leave requests');
  perform assert((select count(*) from leave_balances) = 0,
    'Another tenant sees no balances');
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_acct, org_a)::text, true);
  set local role authenticated;
  select count(*) into n from leave_requests;
  perform assert(n > 0, 'Accounts can read leave — the matrix gives it Read');
  reset role;

  raise notice '--- leave assertions passed ---';
end
$$;


-- ---------------------------------------------------------------------------
-- Entitlements, and why the leave module needed a screen for them.
--
-- That an employee cannot move their own balance is asserted above. What was
-- missing is the other side: a balance row is created only by
-- apply_leave_balance on final approval, leave_days_remaining returns 0 when
-- there is no row, and request_leave refuses any capped type on that. So a
-- workspace with no entitlements set refuses every annual leave request, and
-- nothing in the product could change the answer.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  emp uuid;
  annual uuid;
  yr smallint := extract(year from current_date)::smallint;
begin
  select * into f from fixture;
  select id into emp from employees
   where organization_id = f.org_a and user_id = f.u_emp;
  select id into annual from leave_types
   where organization_id = f.org_a and annual_entitlement_days is not null
   limit 1;

  perform assert(annual is not null, 'There is a capped leave type');

  -- The state a fresh leave year is actually in.
  delete from leave_balances
   where employee_id = emp and leave_type_id = annual and leave_year = yr;

  perform assert(
    leave_days_remaining(emp, annual, yr) = 0,
    'With no balance row nothing is left — which is what refuses every request'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, f.org_a),
      format($q$insert into leave_balances
                  (organization_id, employee_id, leave_type_id, leave_year, entitled_days)
                values (%L, %L, %L, %L, 20)$q$,
             f.org_a, emp, annual, yr)
    ) = 1,
    'HR can set an entitlement, which is what the balances screen writes'
  );

  perform assert(
    leave_days_remaining(emp, annual, yr) = 20,
    'and the days become available to request'
  );

  -- Accounts sees leave for payroll and does not set policy.
  perform assert(
    rows_changed_by(
      claims_for(f.u_acct, f.org_a),
      format('update leave_balances set entitled_days = 60 where employee_id = %L and leave_type_id = %L and leave_year = %L',
             emp, annual, yr)
    ) = 0,
    'Accounts reads leave for payroll but does not set entitlements'
  );

  raise notice '--- leave entitlement assertions passed ---';
end
$$;
