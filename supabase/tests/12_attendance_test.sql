-- Attendance RLS and the check-in write path.
--
-- The question this file exists to answer: can an employee record themselves
-- as having been at the office when they were not? Everything else follows.
--
-- Depends on fixtures from 10_rls_test.sql and 11_employees_test.sql.

set client_min_messages = notice;

do $$
declare
  f record;
  org_a uuid;
  office_a uuid;
  emp_chidi uuid;
  rec attendance_records;
  n integer;
begin
  select * into f from fixture;
  org_a := f.org_a;

  select id into office_a from offices where organization_id = org_a limit 1;
  select id into emp_chidi from employees where employee_no = 'EMP-0142';

  -- Give the employee a shift so lateness has something to measure against.
  insert into employee_shifts (organization_id, employee_id, shift_pattern_id, effective_from)
  select org_a, emp_chidi, sp.id, date '2020-01-01'
  from shift_patterns sp where sp.organization_id = org_a limit 1;

  -- === A clean office check-in ============================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;

  -- 6.43125,3.42195 is ~42m from the seeded Victoria Island pin.
  select * into rec from check_in(6.431500, 3.421900, 8, 'Chrome/Android');

  perform assert(rec.attendance_type = 'office',
    'A fix 33m from the pin with ±8m inside a 150m fence is recorded as office');
  perform assert(rec.state = 'checked_in', 'The record opens in checked_in');
  perform assert(rec.review_state = 'not_required',
    'A clean check-in needs no review');
  perform assert(rec.check_in_at is not null,
    'The check-in time is set by the server, not supplied by the caller');
  reset role;

  -- === A duplicate check-in returns the open record rather than a second one
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  perform check_in(6.431500, 3.421900, 8, 'Chrome/Android');
  reset role;

  select count(*) into n from attendance_records where employee_id = emp_chidi;
  perform assert(n = 1, 'A duplicate check-in cannot create a second open record');

  -- === An employee cannot write a record directly =========================
  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'insert into attendance_records (organization_id, employee_id, work_date, attendance_type)
       values (''' || org_a || ''', ''' || emp_chidi || ''', current_date + 1, ''office'')'),
    'An employee cannot insert an attendance record directly — no insert policy exists');

  -- === The captured check-in time is immutable ============================
  perform assert(
    denies(claims_for(f.u_hr, org_a),
      'update attendance_records set check_in_at = now() - interval ''3 hours''
       where employee_id = ''' || emp_chidi || ''''),
    'Even HR cannot rewrite a captured check-in time — corrections are new records');

  -- === Check-out ==========================================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into rec from check_out(6.431500, 3.421900, 9);
  perform assert(rec.state = 'checked_out', 'Check-out closes the record');
  perform assert(rec.check_out_at is not null, 'Check-out records a server timestamp');
  reset role;

  -- === Scope: who can see the record ======================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  perform assert((select count(*) from attendance_records) = 1,
    'An Employee sees their own attendance');
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  perform assert((select count(*) from attendance_records) = 1,
    'HR sees attendance across the organization');
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_other, f.org_b)::text, true);
  set local role authenticated;
  perform assert((select count(*) from attendance_records) = 0,
    'Another tenant sees none of this organization''s attendance');
  reset role;

  -- === A poor fix is recorded, classified honestly, and flagged ===========
  -- Same spot, but a ±140m reading: the circle straddles the fence, so the
  -- product must not claim the employee was at the office.
  delete from attendance_records where employee_id = emp_chidi;

  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into rec from check_in(6.431500, 3.421900, 140, 'Chrome/Android');
  perform assert(rec.attendance_type = 'uncertain',
    'A fix too coarse to resolve the fence is recorded as uncertain, not office');
  perform assert(rec.review_state = 'pending',
    'An unresolved position is flagged for HR rather than auto-decided');
  perform assert('poor_accuracy' = any(rec.exception_codes),
    'The poor accuracy is recorded on the record');
  reset role;

  -- === A denied location still records the time ===========================
  delete from attendance_records where employee_id = emp_chidi;

  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into rec from check_in(null, null, null, 'Chrome/Android');
  perform assert(rec.check_in_at is not null,
    'A check-in with location denied still records the time — a flagged '
    'check-in beats no check-in');
  perform assert(rec.attendance_type = 'uncertain',
    'With no position the classification is uncertain, never office');
  perform assert('no_location' = any(rec.exception_codes),
    'The missing location is recorded as an exception');
  reset role;

  -- === Auto-close never deletes and never rewrites the check-in ===========
  update attendance_records set work_date = current_date - 1 where employee_id = emp_chidi;

  declare
    original_check_in timestamptz;
  begin
    select check_in_at into original_check_in
    from attendance_records where employee_id = emp_chidi;

    perform auto_close_stale_attendance();

    select * into rec from attendance_records where employee_id = emp_chidi;
    perform assert(rec.state = 'auto_closed', 'A stale open record is auto-closed');
    perform assert(rec.review_state = 'pending', 'An auto-closed record is flagged');
    perform assert('no_check_out' = any(rec.exception_codes),
      'The missing check-out is recorded as an exception');
    perform assert(rec.check_in_at = original_check_in,
      'Auto-close leaves the captured check-in exactly as it was');
  end;

  -- === A correction is a new row, and needs a real reason =================
  perform assert(
    denies(claims_for(f.u_hr, org_a),
      'insert into attendance_corrections (organization_id, attendance_record_id, corrected_by, reason)
       values (''' || org_a || ''', ''' || rec.id || ''', ''' || f.u_hr || ''', ''oops'')'),
    'A correction reason of under 10 characters is rejected');

  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  insert into attendance_corrections (organization_id, attendance_record_id, corrected_by, reason)
  values (org_a, rec.id, f.u_hr, 'Employee confirmed they left at 17:00; depot network was down.');
  perform assert((select count(*) from attendance_corrections) = 1,
    'HR can record a correction with a stated reason');
  reset role;

  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'insert into attendance_corrections (organization_id, attendance_record_id, corrected_by, reason)
       values (''' || org_a || ''', ''' || rec.id || ''', ''' || f.u_emp || ''', ''I was actually there all day honestly'')'),
    'An employee cannot correct their own attendance record');

  raise notice '--- attendance assertions passed ---';
end
$$;


-- ---------------------------------------------------------------------------
-- Clearing the flag.
--
-- Corrections and the immutability of check_in_at are asserted above. What was
-- missing is the other half of a review: moving `review_state` off 'pending'.
-- The attendance screen counted flagged records and offered no way to deal
-- with one, so the number only ever went up. These are what the review buttons
-- rest on.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  rec uuid;
begin
  select * into f from fixture;

  select id into rec from attendance_records
   where organization_id = f.org_a and review_state = 'pending'
   limit 1;

  perform assert(rec is not null, 'There is a flagged record to review');

  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, f.org_a),
      format('update attendance_records set review_state = ''approved'' where id = %L', rec)
    ) = 0,
    'An employee cannot clear the flag on their own record'
  );

  perform assert(
    (select review_state from attendance_records where id = rec) = 'pending',
    'and the flag is still there afterwards'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, f.org_a),
      format('update attendance_records set review_state = ''approved'' where id = %L', rec)
    ) = 1,
    'HR can accept a flagged record as recorded'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, f.org_a),
      format('update attendance_records set review_state = ''corrected'' where id = %L', rec)
    ) = 1,
    'and can mark one as superseded by a correction'
  );

  -- Accounts reads attendance for payroll and does not adjudicate it.
  perform assert(
    rows_changed_by(
      claims_for(f.u_acct, f.org_a),
      format('update attendance_records set review_state = ''approved'' where id = %L', rec)
    ) = 0,
    'Accounts reads attendance but does not review it'
  );

  raise notice '--- attendance review assertions passed ---';
end
$$;
