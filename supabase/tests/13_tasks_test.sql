-- Tasks and field-visit verification.
--
-- The question here: can someone claim they visited a store they were not at?
--
-- Depends on fixtures from 10, 11 and 12.

set client_min_messages = notice;

do $$
declare
  f record;
  org_a uuid;
  dept_sales uuid;
  u_hod uuid;
  emp_chidi uuid; emp_other uuid;
  t_field uuid; t_desk uuid;
  v field_visits;
  n integer;
begin
  select * into f from fixture;
  org_a := f.org_a;
  select id into dept_sales from departments where code = 'DPT-SLS' and organization_id = org_a;
  select user_id into u_hod from department_heads where department_id = dept_sales;
  select id into emp_chidi from employees where employee_no = 'EMP-0142';
  select id into emp_other from employees where employee_no = 'EMP-0044';

  -- A field task at a store, and a desk task needing no proof.
  insert into tasks (organization_id, reference, title, department_id, created_by,
                     verification_mode, status)
  values (org_a, next_task_reference(), 'Shelf audit — Shoprite Lekki', dept_sales,
          u_hod, 'photo_location_report', 'todo')
  returning id into t_field;

  insert into tasks (organization_id, reference, title, department_id, created_by,
                     verification_mode)
  values (org_a, next_task_reference(), 'Update the price list', dept_sales, u_hod, 'none')
  returning id into t_desk;

  insert into task_assignees (task_id, employee_id) values (t_field, emp_chidi), (t_desk, emp_chidi);

  -- Shoprite Lekki, roughly. 100m tolerance.
  insert into task_target_locations (organization_id, task_id, name, latitude, longitude, allowed_radius_m)
  values (org_a, t_field, 'Shoprite Lekki', 6.448900, 3.471200, 100);

  -- === Scope ==============================================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  perform assert((select count(*) from tasks) = 2,
    'An assignee sees the tasks assigned to them');
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_acct, org_a)::text, true);
  set local role authenticated;
  perform assert((select count(*) from tasks) = 0,
    'Accounts sees no tasks at all — the matrix gives it none');
  reset role;

  perform set_config('request.jwt.claims', claims_for(u_hod, org_a)::text, true);
  set local role authenticated;
  perform assert((select count(*) from tasks) = 2,
    'An HOD sees tasks in the department they head');
  reset role;

  -- === The out-of-range block =============================================
  -- Victoria Island is ~5km from the Lekki store. This is the claim the
  -- module exists to refuse.
  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'select submit_field_visit(''' || t_field || ''', 6.431200, 3.421900, 8,
        ''Shelves restocked and faced, all SKUs present and correct.'')'),
    'A visit submitted 5km from the store is refused, not recorded');

  perform assert((select count(*) from field_visits) = 0,
    'Nothing was written by the refused attempt');

  -- === A genuine visit, in range ==========================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into v from submit_field_visit(t_field, 6.448950, 3.471250, 9,
    'Shelves restocked and faced. Two SKUs out of stock, reported to the depot.');
  perform assert(v.state = 'submitted', 'A visit at the store submits cleanly');
  perform assert(v.distance_m < 100, 'The distance is computed from the target, not supplied');
  perform assert(v.submitted_at is not null, 'The submission time is server-side');
  reset role;

  -- === A poor fix at the door is allowed, and flagged =====================
  delete from field_visits;
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  -- 140m away but +/-180m: the near edge of the circle reaches the store, so
  -- a genuine visit is not blocked — but the reviewer is told.
  select * into v from submit_field_visit(t_field, 6.450100, 3.471200, 180,
    'Visit completed, network was poor inside the building.');
  perform assert(v.state = 'flagged',
    'A coarse fix is accepted but flagged rather than silently trusted');
  perform assert('poor_accuracy' = any(v.exception_codes),
    'The poor accuracy is recorded on the visit');
  reset role;

  -- === A report is required where the mode says so ========================
  delete from field_visits;
  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'select submit_field_visit(''' || t_field || ''', 6.448950, 3.471250, 9, ''ok'')'),
    'A one-word report is refused when the task requires a written one');

  -- === Only an assignee may submit ========================================
  perform assert(
    denies(claims_for(f.u_acct, org_a),
      'select submit_field_visit(''' || t_field || ''', 6.448950, 3.471250, 9,
        ''I happened to be passing the store today.'')'),
    'Someone the task is not assigned to cannot submit a visit for it');

  -- === Review: accept and return ==========================================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  select * into v from submit_field_visit(t_field, 6.448950, 3.471250, 9,
    'Shelves restocked and faced. Two SKUs out of stock, reported to the depot.');
  reset role;

  perform assert(
    denies(claims_for(f.u_emp, org_a),
      'select review_field_visit(''' || v.id || ''', true)'),
    'An employee cannot verify their own visit');

  perform assert(
    denies(claims_for(u_hod, org_a),
      'select review_field_visit(''' || v.id || ''', false, ''blurry'')'),
    'Returning a visit with a nine-character reason is refused');

  perform set_config('request.jwt.claims', claims_for(u_hod, org_a)::text, true);
  set local role authenticated;
  select * into v from review_field_visit(v.id, false,
    'The photo only shows the top shelf — please re-shoot the full bay.');
  perform assert(v.state = 'returned', 'An HOD can return a visit');
  perform assert(v.review_reason is not null, 'The reason is stored with the return');
  perform assert(v.submitted_at is not null and v.distance_m is not null,
    'A returned visit keeps its original capture alongside the reason');
  reset role;

  -- === Assignment scope ===================================================
  perform assert(
    denies(claims_for(u_hod, org_a),
      'insert into tasks (organization_id, reference, title, created_by, department_id)
       values (''' || org_a || ''', ''TSK-X1'', ''Cross-department work'', ''' || u_hod || ''', null)'),
    'An HOD cannot create a task outside the department they head');

  -- === Tasks are never deleted ============================================
  perform assert(
    denies(claims_for(u_hod, org_a), 'delete from tasks where id = ''' || t_desk || ''''),
    'Tasks cannot be deleted — cancelled tasks stay visible');

  -- === Activity is readable, not writable =================================
  perform set_config('request.jwt.claims', claims_for(u_hod, org_a)::text, true);
  set local role authenticated;
  select count(*) into n from task_activity where task_id = t_field;
  perform assert(n >= 2, 'Submission and review are both recorded in the activity trail');
  reset role;

  perform assert(
    denies(claims_for(u_hod, org_a),
      'insert into task_activity (organization_id, task_id, action)
       values (''' || org_a || ''', ''' || t_field || ''', ''faked.event'')'),
    'A client cannot write task activity directly');

  -- === Tenant isolation ===================================================
  perform set_config('request.jwt.claims', claims_for(f.u_other, f.org_b)::text, true);
  set local role authenticated;
  perform assert((select count(*) from tasks) = 0, 'Another tenant sees no tasks');
  perform assert((select count(*) from field_visits) = 0, 'Another tenant sees no visits');
  reset role;

  raise notice '--- task assertions passed ---';
end
$$;
