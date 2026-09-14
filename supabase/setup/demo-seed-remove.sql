-- ===========================================================================
-- Remove the demo data.
--
-- Deletes exactly what supabase/setup/demo-seed.sql created and nothing else.
-- Your configuration — departments, positions, offices, shift patterns, leave
-- types, statutory rates, PAYE bands, roles, your own account — is untouched.
--
-- Every demo row was written with an id in a reserved range
-- (…-8001-… through …-800d-…), so this matches on identity rather than
-- guessing from names or dates. Anything you created yourself through the app
-- has a random id and is not in that range.
--
-- Order matters: children before parents, because the schema deliberately
-- restricts deletes that would orphan a payslip or a run line.
-- ===========================================================================

begin;

do $undo$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001';
  v_removed integer;
  v_total   integer := 0;
begin
  -- Recruitment
  delete from job_applications where id::text like '00000000-0000-4000-800d-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'applicants removed: %', v_removed;

  delete from jobs where id::text like '00000000-0000-4000-800c-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'roles removed: %', v_removed;

  -- Payroll. Payslips first: payroll_run_lines is `on delete restrict` from
  -- payslips, which is the schema refusing to let an issued payslip lose the
  -- figures behind it.
  --
  -- Two triggers refuse these deletes outright — payslips_immutable and
  -- payroll_run_lines_locked. That is correct and deliberate: an issued
  -- payslip is a document, and nothing reaching the database through the
  -- application may withdraw one. This script is not the application. It runs
  -- as the table owner, deletes only rows it created itself, and puts the
  -- triggers back in the same transaction — so if anything here fails, the
  -- rollback restores them along with the data.
  --
  -- If that trade is not one you want to make, stop here: the demo payroll is
  -- harmless to leave in place, and everything above this point has already
  -- been removed.
  alter table payslips disable trigger payslips_immutable;
  alter table payroll_run_lines disable trigger payroll_run_lines_locked;

  delete from payslips where id::text like '00000000-0000-4000-800b-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'payslips removed: %', v_removed;

  delete from payroll_run_lines
   where payroll_period_id::text like '00000000-0000-4000-800a-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'payroll lines removed: %', v_removed;

  delete from payroll_periods where id::text like '00000000-0000-4000-800a-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'payroll periods removed: %', v_removed;

  alter table payslips enable trigger payslips_immutable;
  alter table payroll_run_lines enable trigger payroll_run_lines_locked;

  -- Leave
  delete from leave_approvals where id::text like '00000000-0000-4000-8009-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;

  delete from leave_requests where id::text like '00000000-0000-4000-8008-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'leave requests removed: %', v_removed;

  delete from leave_balances where id::text like '00000000-0000-4000-8007-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'leave balances removed: %', v_removed;

  -- Tasks. Assignees and activity cascade from tasks; field visits do too,
  -- but they are named here so the count is reported rather than silent.
  delete from field_visits where id::text like '00000000-0000-4000-8006-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'field visits removed: %', v_removed;

  delete from tasks where id::text like '00000000-0000-4000-8005-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'tasks removed: %', v_removed;

  -- Attendance
  delete from attendance_records where id::text like '00000000-0000-4000-8004-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'attendance records removed: %', v_removed;

  -- Headship. Only the two rows the demo added; if you assigned a head
  -- yourself through the app, its id is not in this range and it stays.
  delete from department_heads where id::text like '00000000-0000-4000-8003-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;

  -- People. Compensation first, then clear the reporting lines that point at
  -- demo employees, then the employees themselves.
  delete from employee_compensation where id::text like '00000000-0000-4000-8002-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;

  update employees set manager_id = null
   where manager_id::text like '00000000-0000-4000-8001-%';

  delete from employees where id::text like '00000000-0000-4000-8001-%';
  get diagnostics v_removed = row_count; v_total := v_total + v_removed;
  raise notice 'employees removed: %', v_removed;

  raise notice '---';
  raise notice 'Demo data removed — % rows in total.', v_total;
  raise notice 'Configuration and your own account are untouched.';
end
$undo$;

commit;
