-- Payroll.
--
-- Three things under test, in order of how much they cost if wrong:
--   1. A published payslip never changes, whatever happens to the salary.
--   2. The person who submits a run cannot approve it.
--   3. Progressive tax is applied per band, not as one rate on the whole.
--
-- Depends on fixtures from 10-14.

set client_min_messages = notice;

do $$
declare
  f record;
  org_a uuid;
  emp uuid;
  period uuid;
  p payroll_periods;
  line payroll_run_lines;
  original_net numeric;
  n integer;
begin
  select * into f from fixture;
  org_a := f.org_a;
  select id into emp from employees where employee_no = 'EMP-0142';

  -- Rates from the design's settings screen.
  insert into statutory_rates (organization_id, code, rate_percent, effective_from) values
    (org_a, 'pension_employee', 8.0, date '2020-01-01'),
    (org_a, 'pension_employer', 10.0, date '2020-01-01'),
    (org_a, 'nhf', 2.5, date '2020-01-01');

  -- A simple two-band schedule, so the arithmetic is checkable by hand.
  insert into paye_bands (organization_id, band_order, lower_bound, upper_bound, rate_percent, effective_from) values
    (org_a, 1, 0,       300000, 7.0,  date '2020-01-01'),
    (org_a, 2, 300000,  null,   11.0, date '2020-01-01');

  insert into employee_compensation (organization_id, employee_id, basic_salary, effective_from)
  values (org_a, emp, 310000.00, date '2023-03-03');

  insert into payroll_periods (organization_id, label, starts_on, ends_on, pay_date)
  values (org_a, 'March 2026', date '2026-03-01', date '2026-03-31', date '2026-03-26')
  returning id into period;

  -- === Progressive tax is per band ========================================
  -- 400,000 annual against 0-300k @ 7% and 300k+ @ 11%:
  --   300000 * 0.07 = 21000, plus 100000 * 0.11 = 11000  ->  32000
  -- A single 11% rate on the whole 400,000 would give 44,000. That
  -- difference is the whole point of a band table.
  perform assert(
    calculate_paye_annual(org_a, 400000, date '2026-03-31') = 32000,
    'PAYE taxes each band''s slice, not the whole amount at the top rate');

  perform assert(
    calculate_paye_annual(org_a, 250000, date '2026-03-31') = 17500,
    'Income inside the first band is taxed only at the first rate');

  perform assert(
    calculate_paye_annual(org_a, 0, date '2026-03-31') = 0,
    'No income, no tax');

  -- === Calculation ========================================================
  perform set_config('request.jwt.claims', claims_for(f.u_acct, org_a)::text, true);
  set local role authenticated;
  perform calculate_payroll(period);
  reset role;

  select * into line from payroll_run_lines
  where payroll_period_id = period and employee_id = emp;

  perform assert(line.basic_salary = 310000.00, 'Basic comes from the effective-dated compensation');
  perform assert(line.pension_employee = 24800.00, 'Employee pension is 8% of basic');
  perform assert(line.pension_employer = 31000.00, 'Employer pension is 10% of basic');
  perform assert(line.nhf = 7750.00, 'NHF is 2.5% of basic');
  perform assert(line.net_pay = line.gross_pay - line.total_deductions,
    'Net is gross less deductions, and the constraint enforces it');
  perform assert(line.employee_name is not null and line.employee_no is not null,
    'The line snapshots the employee''s name and number, not just their id');

  original_net := line.net_pay;

  -- === HR cannot see any of it ============================================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  perform assert((select count(*) from payroll_periods) = 0, 'HR sees no payroll periods');
  perform assert((select count(*) from payroll_run_lines) = 0, 'HR sees no payroll lines');
  perform assert((select count(*) from statutory_rates) = 0, 'HR sees no statutory rates');
  reset role;

  -- === Separation of duties ===============================================
  perform set_config('request.jwt.claims', claims_for(f.u_acct, org_a)::text, true);
  set local role authenticated;
  perform advance_payroll(period, 'review');
  reset role;

  -- Accounts submitted it, so Accounts may not approve it — even though the
  -- role holds payroll.approve in some configurations.
  perform assert(
    denies(claims_for(f.u_acct, org_a),
      'select advance_payroll(''' || period || ''', ''approved'')'),
    'The person who submitted a run cannot approve it');

  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'select advance_payroll(''' || period || ''', ''approved'')'),
    'An employee cannot approve payroll');

  -- Management approves.
  perform set_config('request.jwt.claims', claims_for(f.u_mgmt, org_a)::text, true);
  set local role authenticated;
  select * into p from advance_payroll(period, 'approved');
  perform assert(p.status = 'approved', 'A second person can approve the run');
  perform assert(p.approved_by <> p.submitted_by, 'Two different people are recorded');
  reset role;

  -- === Figures lock at approval ===========================================
  perform assert(
    denies(claims_for(f.u_acct, org_a),
      'select calculate_payroll(''' || period || ''')'),
    'An approved run cannot be recalculated');

  perform assert(
    denies(claims_for(f.u_acct, org_a),
      'update payroll_run_lines set net_pay = 999999 where payroll_period_id = ''' || period || ''''),
    'An approved run''s lines cannot be edited through the API');

  -- The line above passes on the missing UPDATE grant, not on the lock
  -- trigger — so it would keep passing if the trigger were dropped. The
  -- trigger exists for the paths that bypass grants entirely: a
  -- security-definer function, or a service-role connection.
  --
  -- Exercised here as the table owner, which is exactly that scenario.
  declare
    trigger_held boolean := false;
  begin
    begin
      update payroll_run_lines set net_pay = 999999 where payroll_period_id = period;
    exception when check_violation then
      trigger_held := true;
    end;
    perform assert(trigger_held,
      'The lock trigger refuses an approved run''s lines even for a privileged caller');
  end;

  declare
    delete_blocked boolean := false;
  begin
    begin
      delete from payroll_run_lines where payroll_period_id = period;
    exception when check_violation then
      delete_blocked := true;
    end;
    perform assert(delete_blocked,
      'And refuses a delete on an approved run''s lines');
  end;

  -- === Publication, then the snapshot guarantee ===========================
  perform set_config('request.jwt.claims', claims_for(f.u_acct, org_a)::text, true);
  set local role authenticated;
  select * into p from advance_payroll(period, 'published');
  perform assert(p.status = 'published', 'Accounts publishes the approved run');
  reset role;

  select count(*) into n from payslips;
  perform assert(n > 0, 'Publishing issues payslips');

  -- The thing this whole design exists for: give the employee a raise and
  -- confirm March is untouched.
  insert into employee_compensation (organization_id, employee_id, basic_salary, effective_from, reason)
  values (org_a, emp, 500000.00, date '2026-04-01', 'Promotion');

  select * into line from payroll_run_lines
  where payroll_period_id = period and employee_id = emp;

  perform assert(line.basic_salary = 310000.00,
    'A later raise does not change what March recorded');
  perform assert(line.net_pay = original_net,
    'A published payslip''s net pay is exactly what it was');

  -- === A payslip cannot be withdrawn ======================================
  perform assert(
    denies(claims_for(f.u_mgmt, org_a), 'delete from payslips'),
    'A published payslip cannot be withdrawn by anyone');

  perform assert(
    denies(claims_for(f.u_mgmt, org_a),
      'update payslips set published_at = now()'),
    'A published payslip cannot be altered by anyone');

  -- === An employee sees their own payslip, and only that ==================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  perform assert((select count(*) from payslips) = 1,
    'An employee sees exactly one payslip — their own');
  perform assert((select count(*) from payroll_periods) = 0,
    'An employee cannot see the payroll run behind it');
  perform assert((select count(*) from payroll_run_lines) = 1,
    'But can see the figures on their own payslip');
  reset role;

  -- === An adjustment on a locked run is refused, not silently ignored =====
  perform assert(
    denies(claims_for(f.u_acct, org_a),
      'insert into payroll_adjustments (organization_id, payroll_period_id, employee_id, label, amount, reason, created_by)
       values (''' || org_a || ''', ''' || period || ''', ''' || emp || ''', ''Arrears'', 5000,
               ''February field allowance arrears, agreed with the depot manager.'', ''' || f.u_acct || ''')'),
    'An adjustment on a published run is refused — corrections go to the next period');

  -- === Tenant isolation ===================================================
  perform set_config('request.jwt.claims', claims_for(f.u_other, f.org_b)::text, true);
  set local role authenticated;
  perform assert((select count(*) from payroll_run_lines) = 0,
    'Another tenant sees no payroll lines');
  perform assert((select count(*) from payslips) = 0,
    'Another tenant sees no payslips');
  reset role;

  raise notice '--- payroll assertions passed ---';
end
$$;
