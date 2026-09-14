-- The create paths.
--
-- These writes were added after a review found the workspace had review and
-- approval screens but no way to originate anything. The screens are new; the
-- policies they write through mostly are not. So the question here is not
-- "does the form work" — it is whether a form pointed at these tables can be
-- used by someone who should not have it, or against a tenant that is not
-- theirs.
--
-- Every refusal is asserted on its *effect* (rows actually changed), not on
-- whether an exception was raised. A policy that matches no rows does not
-- raise; it silently changes nothing, and denies() alone would pass either way.
--
-- Depends on fixtures from 10-16.

set client_min_messages = notice;

do $$
declare
  f record;
  org_a uuid; org_b uuid;
  dept_sales uuid;
  u_hod uuid;
  emp_chidi uuid;
  t_annual uuid;
  new_task uuid;
  r leave_requests;
  n integer;
  ref text;
begin
  select * into f from fixture;
  org_a := f.org_a; org_b := f.org_b;
  select id into dept_sales from departments where code = 'DPT-SLS' and organization_id = org_a;
  select user_id into u_hod from department_heads where department_id = dept_sales;
  select id into emp_chidi from employees where employee_no = 'EMP-0142';
  select id into t_annual from leave_types
    where organization_id = org_a and name = 'Annual leave';

  -- === Employees ==========================================================
  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, org_a),
      format($q$insert into employees
                 (organization_id, employee_no, first_name, last_name, hire_date)
               values (%L, 'CHF-901', 'Bisi', 'Adeyemi', date '2026-01-05')$q$, org_a)
    ) = 1,
    'HR can create an employee'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, org_a),
      format($q$insert into employees
                 (organization_id, employee_no, first_name, last_name, hire_date)
               values (%L, 'CHF-902', 'Ghost', 'Hire', date '2026-01-05')$q$, org_a)
    ) = 0,
    'An ordinary employee cannot create an employee — employees.create is not theirs'
  );

  -- The form takes organization_id from the session, but the policy is what
  -- actually stops a caller naming someone else's tenant.
  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, org_a),
      format($q$insert into employees
                 (organization_id, employee_no, first_name, last_name, hire_date)
               values (%L, 'SAH-902', 'Cross', 'Tenant', date '2026-01-05')$q$, org_b)
    ) = 0,
    'HR cannot create an employee in another tenant, even naming its id directly'
  );

  -- === Departments and positions ==========================================
  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, org_a),
      format($q$insert into departments (organization_id, code, name)
               values (%L, 'DPT-NEW', 'Trade Marketing')$q$, org_a)
    ) = 1,
    'HR can create a department'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, org_a),
      format($q$insert into departments (organization_id, code, name)
               values (%L, 'DPT-BAD', 'Shadow Unit')$q$, org_a)
    ) = 0,
    'An ordinary employee cannot create a department'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, org_a),
      format($q$insert into positions (organization_id, department_id, title)
               values (%L, %L, 'Trade Marketing Officer')$q$, org_a, dept_sales)
    ) = 1,
    'HR can create a position'
  );

  -- === Tasks ==============================================================
  -- Migration 0028 made the reference a column default. Before it, every
  -- insert had to supply one, which is why nothing could create a task.
  perform set_config('request.jwt.claims', claims_for(u_hod, org_a)::text, true);
  set local role authenticated;

  insert into tasks (organization_id, title, department_id, created_by)
  values (org_a, 'Stock count — Apapa depot', dept_sales, u_hod)
  returning id, reference into new_task, ref;

  reset role;

  perform assert(new_task is not null, 'An HOD can create a task in their own department');
  perform assert(
    ref ~ '^TSK-[0-9]+$',
    format('The task reference is allocated by the database — got %L', ref)
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, org_a),
      format($q$insert into tasks (organization_id, title, created_by)
               values (%L, 'Self-assigned work', %L)$q$, org_a, f.u_emp)
    ) = 0,
    'An ordinary employee cannot create a task'
  );

  -- created_by = auth.uid() is in the insert policy, so a form field naming
  -- someone else does not just get ignored — the write is refused.
  perform assert(
    rows_changed_by(
      claims_for(u_hod, org_a),
      format($q$insert into tasks (organization_id, title, department_id, created_by)
               values (%L, 'Attributed to someone else', %L, %L)$q$,
             org_a, dept_sales, f.u_hr)
    ) = 0,
    'A task cannot be created in another user''s name'
  );

  -- === Assigning ==========================================================
  perform assert(
    rows_changed_by(
      claims_for(u_hod, org_a),
      format($q$insert into task_assignees (task_id, employee_id)
               values (%L, %L)$q$, new_task, emp_chidi)
    ) = 1,
    'An HOD can assign a task in their department'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, org_a),
      format($q$insert into task_assignees (task_id, employee_id)
               values (%L, %L)$q$, new_task, emp_chidi)
    ) = 0,
    'An ordinary employee cannot assign work'
  );

  -- === Payroll periods ====================================================
  perform assert(
    rows_changed_by(
      claims_for(f.u_acct, org_a),
      format($q$insert into payroll_periods (organization_id, label, starts_on, ends_on)
               values (%L, 'April 2026', date '2026-04-01', date '2026-04-30')$q$, org_a)
    ) = 1,
    'Accounts can open a payroll period'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, org_a),
      format($q$insert into payroll_periods (organization_id, label, starts_on, ends_on)
               values (%L, 'HR''s payroll', date '2026-04-01', date '2026-04-30')$q$, org_a)
    ) = 0,
    'HR cannot open a payroll period — they never see payroll figures'
  );

  -- A new period must start in draft. If a client could insert one straight
  -- into approved it would skip the separation of duties in advance_payroll().
  perform assert(
    (select status from payroll_periods
      where organization_id = org_a and label = 'April 2026') = 'draft',
    'A newly created payroll period starts in draft'
  );

  -- === Jobs ===============================================================
  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, org_a),
      format($q$insert into jobs (organization_id, title, slug, status, created_by)
               values (%L, 'Warehouse Supervisor', 'warehouse-supervisor', 'draft', %L)$q$,
             org_a, f.u_hr)
    ) = 1,
    'HR can post a job'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, org_a),
      format($q$insert into jobs (organization_id, title, slug, status, created_by)
               values (%L, 'Invented Role', 'invented-role', 'published', %L)$q$,
             org_a, f.u_emp)
    ) = 0,
    'An ordinary employee cannot post a job — and so cannot publish to the careers site'
  );

  -- Publishing is the one workspace action that puts text on the public
  -- internet. Confirm the boundary is the status, not the caller.
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  perform assert(
    (select count(*) from jobs where slug = 'warehouse-supervisor') = 0,
    'A job saved as a draft is not readable by the public'
  );
  reset role;

  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, org_a),
      $q$update jobs set status = 'published', published_at = now()
         where slug = 'warehouse-supervisor'$q$
    ) = 1,
    'HR can publish a job they created'
  );

  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  perform assert(
    (select count(*) from jobs where slug = 'warehouse-supervisor') = 1,
    'Once published, the role is readable by the public careers site'
  );
  reset role;

  -- === Leave requests =====================================================
  -- leave_requests has no insert policy by design: the balance check, the day
  -- count and the routing have to happen together, so the only way in is
  -- submit_leave_request().
  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, org_a),
      format($q$insert into leave_requests
                 (organization_id, employee_id, leave_type_id, starts_on, ends_on,
                  days_requested, status)
               values (%L, %L, %L, date '2026-06-01', date '2026-06-05', 5, 'approved')$q$,
             org_a, emp_chidi, t_annual)
    ) = 0,
    'An employee cannot insert a leave request directly — no insert policy exists'
  );

  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  r := submit_leave_request(t_annual, date '2026-06-01', date '2026-06-05', 'Family visit');
  reset role;

  perform assert(r.id is not null, 'An employee can submit a leave request through the function');
  perform assert(
    r.status <> 'approved',
    'A submitted request does not arrive already approved'
  );
  perform assert(
    r.employee_id = emp_chidi,
    'The request is attached to the caller''s own employee record, not one they named'
  );

  -- The function takes the employee from the session, so there is no argument
  -- through which to file leave against a colleague.
  select count(*) into n from leave_requests
   where employee_id <> emp_chidi and starts_on = date '2026-06-01';
  perform assert(n = 0, 'No leave was filed against anyone else');
end
$$;

-- ---------------------------------------------------------------------------
-- The create paths leave a trace.
--
-- Every database function has called write_audit() since it was written; the
-- plain inserts behind the create UI did not, so creating an employee or a job
-- left no record at all. An audit log that silently omits a whole class of
-- action is worse than no audit log — someone reading it concludes nothing
-- happened.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  org_a uuid;
  n integer;
  v_label text;
  v_org uuid;
begin
  select * into f from fixture;
  org_a := f.org_a;

  -- An empty claims setting is not the same as an absent one. current_org_id()
  -- cast the setting straight to jsonb, and ''::jsonb raises rather than
  -- returning null — which turned every policy evaluation into an error
  -- instead of a denial. Nothing reached that path until the insert triggers
  -- started calling it on every row.
  perform set_config('request.jwt.claims', '', true);
  v_org := current_org_id();
  perform assert(v_org is null,
    'An empty claims setting resolves to no organization, rather than raising');

  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  insert into employees (organization_id, employee_no, first_name, last_name, hire_date)
  values (org_a, 'CHF-950', 'Audited', 'Hire', current_date);
  reset role;

  select count(*) into n from audit_logs
   where organization_id = org_a
     and action = 'employees.create'
     and metadata ->> 'label' like '%CHF-950%';
  perform assert(n = 1, 'Creating an employee writes one audit entry, with a readable label');

  select actor_user_id::text into v_label from audit_logs
   where organization_id = org_a and action = 'employees.create'
     and metadata ->> 'label' like '%CHF-950%';
  perform assert(v_label = f.u_hr::text,
    'The audit entry names the person who did it, from the session rather than an argument');

  -- Publishing is the one workspace action that puts text on the public
  -- internet, so it is logged as its own event rather than folded into a
  -- generic update.
  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  insert into jobs (organization_id, title, slug, status, created_by)
  values (org_a, 'Audited Role', 'audited-role', 'draft', f.u_hr);
  update jobs set status = 'published', published_at = now() where slug = 'audited-role';
  reset role;

  perform assert(
    (select count(*) from audit_logs where organization_id = org_a and action = 'jobs.create') >= 1,
    'Creating a job is audited'
  );
  perform assert(
    (select count(*) from audit_logs
      where organization_id = org_a and action = 'jobs.published'
        and metadata ->> 'title' = 'Audited Role') = 1,
    'Publishing a job is audited as its own event, not as a generic update'
  );

  -- A seed or a migration has no session. Refusing an insert because it could
  -- not be logged would be the tail wagging the dog.
  perform set_config('request.jwt.claims', '', true);
  insert into departments (organization_id, code, name)
  values (org_a, 'DPT-SEED', 'Seeded With No Session');
  perform assert(
    (select count(*) from departments where code = 'DPT-SEED') = 1,
    'An insert with no organization-scoped session still succeeds, unlogged'
  );

  raise notice '--- audit coverage assertions passed ---';
end
$$;
