-- ===========================================================================
-- DEMO DATA — fictional.
--
-- Paste into the Supabase SQL editor after install.sql and seed.sql.
--
-- WHAT THIS IS
-- 23 invented employees with invented attendance, tasks, leave and payroll,
-- so every screen has something real-shaped in it. It exists to demonstrate
-- and to test the product end to end.
--
-- Every person in here is fictional. None of these names, salaries or records
-- describe anyone at CHF Heron Nigeria or anywhere else. The company's real
-- staff, pay and history are not in this repository and are not ours to
-- invent — see docs/DECISIONS.md D51 and D56.
--
-- NO ACCOUNTS, NO PASSWORDS
-- These employees have no login. `employees.user_id` stays null, which the
-- schema supports ("null until an account is invited"). Nothing here writes
-- to auth.users: creating sign-in credentials from a SQL file is how test
-- passwords end up in production.
--
-- IDEMPOTENT
-- Every row has a fixed id and an `on conflict do nothing`, so running this
-- twice changes nothing the second time — including on a later date, which
-- is the case that used to fail. Attendance ids are derived from the calendar
-- day rather than from how many days ago it was, and the insert conflicts on
-- (employee_id, work_date), which is what the schema actually calls unique.
--
-- TO REMOVE IT
-- Run supabase/setup/demo-seed-remove.sql. It deletes exactly these rows and
-- leaves your real configuration — departments, positions, leave types, PAYE
-- bands — untouched.
--
-- DATES ARE RELATIVE
-- Attendance, tasks and payroll are generated against current_date, so the
-- demo is never stale no matter when it is run.
-- ===========================================================================

begin;

do $demo$
declare
  v_org        uuid := '00000000-0000-4000-8000-000000000001';
  v_admin      uuid;
  v_office_vi  uuid;
  v_office_ikj uuid;
begin

  if not exists (select 1 from organizations where id = v_org) then
    raise exception 'Run supabase/seed.sql first — the tenant does not exist yet.';
  end if;

  -- The one real account, used wherever a row has to name a person: task
  -- author, leave approver, payroll submitter. Everyone else is an employee
  -- record with no login.
  select ur.user_id into v_admin
  from user_roles ur
  join roles r on r.id = ur.role_id
  where ur.organization_id = v_org and r.slug = 'management'
  limit 1;

  if v_admin is null then
    raise exception 'No management user found. Sign in once, attach yourself to the tenant, then re-run.';
  end if;

  select id into v_office_vi  from offices where organization_id = v_org and name like 'Head Office%';
  select id into v_office_ikj from offices where organization_id = v_org and name like 'Ikeja%';

  -- =========================================================================
  -- People
  --
  -- Ids are fixed and sequential (…-8001-…-0001 upward) so this file is
  -- idempotent and the teardown can be exact.
  -- =========================================================================
  insert into employees (id, organization_id, employee_no, first_name, last_name,
                         work_email, phone, location, department_id, position_id,
                         employment_type, employment_status, hire_date)
  select
    ('00000000-0000-4000-8001-' || lpad(p.n::text, 12, '0'))::uuid,
    v_org, p.emp_no, p.first_name, p.last_name,
    lower(p.first_name) || '.' || lower(p.last_name) || '@chfheron.example',
    p.phone, p.location,
    d.id, pos.id,
    p.emp_type::employment_type, p.emp_status::employment_status,
    current_date - (p.tenure_days || ' days')::interval
  from (values
    -- n, employee_no, first, last, dept, position, type, status, tenure, phone, location
    ( 1, 'CHF-1001', 'Ngozi',    'Aliu',      'DPT-MGT', 'Managing Director',          'full_time', 'active',    8900, '+234 803 000 1001', 'Victoria Island'),
    ( 2, 'CHF-1002', 'Emeka',    'Obi',       'DPT-SLS', 'Head of Sales',              'full_time', 'active',    4200, '+234 803 000 1002', 'Victoria Island'),
    ( 3, 'CHF-1003', 'Adaeze',   'Okonkwo',   'DPT-SLS', 'Field Sales Representative', 'full_time', 'active',    1500, '+234 803 000 1003', 'Apapa'),
    ( 4, 'CHF-1004', 'Tunde',    'Bakare',    'DPT-SLS', 'Field Sales Representative', 'full_time', 'active',    1100, '+234 803 000 1004', 'Ikeja'),
    ( 5, 'CHF-1005', 'Chidinma', 'Eze',       'DPT-SLS', 'Field Sales Representative', 'full_time', 'active',     420, '+234 803 000 1005', 'Ikeja'),
    ( 6, 'CHF-1006', 'Segun',    'Adeyemi',   'DPT-SLS', 'Sales Representative',       'full_time', 'active',    2200, '+234 803 000 1006', 'Victoria Island'),
    ( 7, 'CHF-1007', 'Fatima',   'Yusuf',     'DPT-SLS', 'Sales Representative',       'full_time', 'active',     260, '+234 803 000 1007', 'Abuja'),
    ( 8, 'CHF-1008', 'Kelechi',  'Nwosu',     'DPT-SLS', 'Merchandiser',               'part_time', 'active',     640, '+234 803 000 1008', 'Apapa'),
    ( 9, 'CHF-1009', 'Halima',   'Sani',      'DPT-SLS', 'Sales Analyst',              'full_time', 'probation',   75, '+234 803 000 1009', 'Victoria Island'),
    (10, 'CHF-1010', 'Bode',     'Ogunleye',  'DPT-LOG', 'Director, Operations',       'full_time', 'active',    3600, '+234 803 000 1010', 'Apapa'),
    (11, 'CHF-1011', 'Ifeanyi',  'Okafor',    'DPT-LOG', 'Dispatch Supervisor',        'full_time', 'active',    1900, '+234 803 000 1011', 'Ikeja'),
    (12, 'CHF-1012', 'Musa',     'Danjuma',   'DPT-LOG', 'Delivery Driver',            'full_time', 'active',     980, '+234 803 000 1012', 'Ikeja'),
    (13, 'CHF-1013', 'Yemi',     'Alabi',     'DPT-LOG', 'Delivery Driver',            'contract',  'active',     310, '+234 803 000 1013', 'Apapa'),
    (14, 'CHF-1014', 'Uche',     'Nnamdi',    'DPT-WHS', 'Warehouse Supervisor',       'full_time', 'active',    2700, '+234 803 000 1014', 'Apapa'),
    (15, 'CHF-1015', 'Blessing', 'Etim',      'DPT-WHS', 'Stock Controller',           'full_time', 'active',    1400, '+234 803 000 1015', 'Apapa'),
    (16, 'CHF-1016', 'Sadiq',    'Bello',     'DPT-WHS', 'Warehouse Assistant',        'full_time', 'active',     720, '+234 803 000 1016', 'Ikeja'),
    (17, 'CHF-1017', 'Grace',    'Udo',       'DPT-WHS', 'Warehouse Assistant',        'nysc',      'active',     150, '+234 803 000 1017', 'Ikeja'),
    (18, 'CHF-1018', 'Ifeoma',   'Balogun',   'DPT-FIN', 'Head of Finance',            'full_time', 'active',    3100, '+234 803 000 1018', 'Victoria Island'),
    (19, 'CHF-1019', 'Kunle',    'Adebayo',   'DPT-FIN', 'Accounts Officer',           'full_time', 'active',    1250, '+234 803 000 1019', 'Victoria Island'),
    (20, 'CHF-1020', 'Zainab',   'Ibrahim',   'DPT-FIN', 'Payroll Officer',            'full_time', 'active',     890, '+234 803 000 1020', 'Victoria Island'),
    (21, 'CHF-1021', 'Amaka',    'Nwachukwu', 'DPT-HR',  'Head of People',             'full_time', 'active',    2400, '+234 803 000 1021', 'Victoria Island'),
    (22, 'CHF-1022', 'Tobi',     'Fashola',   'DPT-HR',  'HR Officer',                 'full_time', 'active',     540, '+234 803 000 1022', 'Victoria Island'),
    (23, 'CHF-1023', 'Ruth',     'Okoro',     'DPT-CMP', 'Compliance Officer',         'full_time', 'active',    1750, '+234 803 000 1023', 'Apapa')
  ) as p(n, emp_no, first_name, last_name, dept_code, position_title,
         emp_type, emp_status, tenure_days, phone, location)
  join departments d on d.organization_id = v_org and d.code = p.dept_code
  left join positions pos on pos.organization_id = v_org
                         and pos.department_id = d.id
                         and pos.title = p.position_title
  on conflict (id) do nothing;

  -- Attach the signed-in account to the Managing Director record.
  --
  -- Without this the one real user has no employee row, and every self-scoped
  -- view is empty for them: no payslip, no leave balance, no attendance, no
  -- assigned tasks — because my_employee_id() returns null and the policies
  -- correctly match nothing. The screens were not broken; there was simply
  -- nobody behind the account.
  update employees
  set user_id = v_admin
  where organization_id = v_org
    and employee_no = 'CHF-1001'
    and user_id is null
    and not exists (
      select 1 from employees other
      where other.organization_id = v_org and other.user_id = v_admin
    );

  -- Reporting lines: everyone reports to their department's most senior person.
  update employees e
  set manager_id = head.id
  from employees head
  where e.organization_id = v_org
    and head.organization_id = v_org
    and head.employee_no in ('CHF-1002','CHF-1010','CHF-1014','CHF-1018','CHF-1021')
    and head.department_id = e.department_id
    and e.id <> head.id
    and e.employee_no like 'CHF-10%'
    and e.manager_id is null;

  -- Everyone senior reports to the MD.
  update employees e
  set manager_id = (select id from employees where organization_id = v_org and employee_no = 'CHF-1001')
  where e.organization_id = v_org
    and e.employee_no in ('CHF-1002','CHF-1010','CHF-1014','CHF-1018','CHF-1021','CHF-1023')
    and e.manager_id is null;

  -- =========================================================================
  -- Compensation. Monthly basic, in naira. Invented, but in a plausible
  -- spread so the payroll totals and the PAYE bands both do something
  -- visible — a flat salary for everyone would make the tax calculation look
  -- like it was not running.
  -- =========================================================================
  insert into employee_compensation (id, organization_id, employee_id, basic_salary,
                                     effective_from, reason)
  select
    ('00000000-0000-4000-8002-' || lpad(c.n::text, 12, '0'))::uuid,
    v_org, e.id, c.salary, e.hire_date, 'Demo data'
  from (values
    ( 1, 'CHF-1001', 2400000.00), ( 2, 'CHF-1002', 1150000.00), ( 3, 'CHF-1003',  420000.00),
    ( 4, 'CHF-1004',  410000.00), ( 5, 'CHF-1005',  385000.00), ( 6, 'CHF-1006',  465000.00),
    ( 7, 'CHF-1007',  440000.00), ( 8, 'CHF-1008',  180000.00), ( 9, 'CHF-1009',  520000.00),
    (10, 'CHF-1010', 1080000.00), (11, 'CHF-1011',  540000.00), (12, 'CHF-1012',  245000.00),
    (13, 'CHF-1013',  230000.00), (14, 'CHF-1014',  610000.00), (15, 'CHF-1015',  395000.00),
    (16, 'CHF-1016',  215000.00), (17, 'CHF-1017',  120000.00), (18, 'CHF-1018', 1240000.00),
    (19, 'CHF-1019',  480000.00), (20, 'CHF-1020',  455000.00), (21, 'CHF-1021',  960000.00),
    (22, 'CHF-1022',  390000.00), (23, 'CHF-1023',  575000.00)
  ) as c(n, emp_no, salary)
  join employees e on e.organization_id = v_org and e.employee_no = c.emp_no
  on conflict (id) do nothing;

  -- =========================================================================
  -- Department headship.
  --
  -- department_heads points at a *user*, not an employee, and these people
  -- have no accounts. So the one real account heads Sales and Logistics —
  -- enough for the HOD-scoped views and policies to return something without
  -- inventing logins.
  -- =========================================================================
  insert into department_heads (id, organization_id, department_id, user_id)
  select ('00000000-0000-4000-8003-' || lpad(row_number() over (order by d.code)::text, 12, '0'))::uuid,
         v_org, d.id, v_admin
  from departments d
  where d.organization_id = v_org and d.code in ('DPT-SLS', 'DPT-LOG')
  on conflict (department_id, user_id) do nothing;

  raise notice 'people: % employees', (select count(*) from employees where organization_id = v_org and employee_no like 'CHF-10%');
end
$demo$;

commit;

-- ===========================================================================
-- Attendance: the last 30 days.
--
-- Generated rather than listed, so it stays current whenever this is run and
-- so the mix is deterministic rather than hand-picked. The pattern is driven
-- by a hash of (employee, day), which gives each person a stable character —
-- one is reliably early, another is often late — instead of noise that looks
-- the same for everyone.
--
-- Weekends are skipped. The spread is roughly: 78% on time at an office, 9%
-- late, 8% remote, 5% no record at all (the absences the dashboard counts).
-- ===========================================================================
do $demo$
declare
  v_org uuid := '00000000-0000-4000-8000-000000000001';
  v_office_vi  uuid;
  v_office_ikj uuid;
  n integer;
begin
  select id into v_office_vi  from offices where organization_id = v_org and name like 'Head Office%';
  select id into v_office_ikj from offices where organization_id = v_org and name like 'Ikeja%';

  insert into attendance_records (
    id, organization_id, employee_id, office_id, work_date,
    check_in_at, check_out_at,
    check_in_latitude, check_in_longitude, check_in_accuracy_m, check_in_distance_m,
    check_out_latitude, check_out_longitude, check_out_accuracy_m, check_out_distance_m,
    attendance_type, state, review_state, exception_codes, late_by_minutes, device)
  select
    -- Deterministic from employee and the *calendar day*, not from how long
    -- ago it was. An offset from current_date gives the same person-and-day a
    -- different id on a different run date, which is how this file came to
    -- claim it was idempotent and not be.
    ('00000000-0000-4000-8004-' || lpad((a.seq * 100000 + a.day_number)::text, 12, '0'))::uuid,
    v_org, a.employee_id,
    case when a.kind = 'remote' then null
         when a.at_ikeja then v_office_ikj else v_office_vi end,
    a.d,
    a.d + a.start_time,
    a.d + a.start_time + interval '8 hours 25 minutes',
    case when a.kind = 'remote' then 6.5244 when a.at_ikeja then 6.601755 else 6.431190 end,
    case when a.kind = 'remote' then 3.3792 when a.at_ikeja then 3.351480 else 3.421884 end,
    case when a.kind = 'remote' then 45.0 else 12.0 end,
    case when a.kind = 'remote' then 9400.0 when a.at_ikeja then 24.0 else 18.0 end,
    case when a.kind = 'remote' then 6.5244 when a.at_ikeja then 6.601755 else 6.431190 end,
    case when a.kind = 'remote' then 3.3792 when a.at_ikeja then 3.351480 else 3.421884 end,
    case when a.kind = 'remote' then 40.0 else 14.0 end,
    case when a.kind = 'remote' then 9380.0 when a.at_ikeja then 21.0 else 15.0 end,
    (case when a.kind = 'remote' then 'remote' else 'office' end)::attendance_type,
    'checked_out'::attendance_state,
    (case when a.kind = 'remote' then 'pending' else 'not_required' end)::attendance_review_state,
    case when a.kind = 'remote' then array['outside_geofence']
         when a.kind = 'late'   then array['late_arrival']
         else '{}'::text[] end,
    case when a.kind = 'late' then a.late_minutes else null end,
    case when a.kind = 'remote' then 'Android · Chrome' else 'iOS · Safari' end
  from (
    select
      e.id as employee_id,
      row_number() over (order by e.employee_no) as seq,
      g.d::date as d,
      (g.d::date - date '2020-01-01') as day_number,
      -- Stable per (person, day): same person, same day, same outcome.
      (abs(hashtext(e.employee_no || g.d::date::text)) % 100) as roll,
      e.location = 'Ikeja' as at_ikeja,
      case
        when (abs(hashtext(e.employee_no || g.d::date::text)) % 100) < 5  then 'absent'
        when (abs(hashtext(e.employee_no || g.d::date::text)) % 100) < 13 then 'remote'
        when (abs(hashtext(e.employee_no || g.d::date::text)) % 100) < 22 then 'late'
        else 'present'
      end as kind,
      case
        when (abs(hashtext(e.employee_no || g.d::date::text)) % 100) < 22
          then time '09:00' + ((abs(hashtext(e.employee_no || g.d::date::text)) % 47 + 16) || ' minutes')::interval
        else time '08:00' + ((abs(hashtext(e.employee_no || g.d::date::text)) % 50) || ' minutes')::interval
      end as start_time,
      (abs(hashtext(e.employee_no || g.d::date::text)) % 47 + 16) as late_minutes
    from employees e
    cross join generate_series(current_date - 29, current_date - 1, interval '1 day') as g(d)
    where e.organization_id = v_org
      and e.employee_no like 'CHF-10%'
      and extract(isodow from g.d) between 1 and 5
  ) a
  where a.kind <> 'absent'
  -- On the constraint that actually decides whether this row exists. The
  -- primary key is not it: a database seeded by an earlier version of this
  -- file holds these days under different ids, and skipping on `id` would let
  -- a second copy of the same day through to fail here instead.
  on conflict (employee_id, work_date) do nothing;

  select count(*) into n from attendance_records where organization_id = v_org;
  raise notice 'attendance: % records over the last 30 days', n;
end
$demo$;

-- ===========================================================================
-- Tasks and field visits.
--
-- Spread across the board's five columns so the Tasks screen is not one long
-- "todo" list, and three of them carry field visits in different states —
-- submitted (waiting on a reviewer), verified, and returned. The returned one
-- carries a reason, because the schema insists on one and so does the design:
-- the assignee has to know what to do differently.
-- ===========================================================================
do $demo$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_admin uuid;
  n integer := 0;
begin
  select ur.user_id into v_admin
  from user_roles ur join roles r on r.id = ur.role_id
  where ur.organization_id = v_org and r.slug = 'management' limit 1;

  insert into tasks (id, organization_id, title, description, department_id, created_by,
                     priority, status, verification_mode, start_date, due_date, completed_at)
  select
    ('00000000-0000-4000-8005-' || lpad(x.n::text, 12, '0'))::uuid,
    v_org, x.title, x.description, d.id, v_admin,
    x.priority::task_priority, x.status::task_status, x.mode::verification_mode,
    current_date - x.starts_days_ago,
    current_date + x.due_in_days,
    case when x.status = 'completed' then now() - (x.starts_days_ago || ' days')::interval + interval '2 days' end
  from (values
    (1, 'Stock count — Apapa depot', 'Full FEFO count of ambient lines. Photograph each bay before moving anything.',
        'DPT-WHS', 'high', 'in_progress', 'photo_location_report', 3, 2),
    (2, 'Shelf audit — Shoprite Ikeja City Mall', 'Confirm planogram compliance and facings for Sebamed and Vileda.',
        'DPT-SLS', 'medium', 'review', 'photo_location', 2, 1),
    (3, 'Open-market coverage — Trade Fair', 'Visit the six listed distributors and record order intent.',
        'DPT-SLS', 'high', 'in_progress', 'photo_location', 1, 3),
    (4, 'Fleet inspection — dispatch vans', 'Tyre, log book and cold-chain check on all six vans before month end.',
        'DPT-LOG', 'urgent', 'todo', 'photo', 0, 5),
    (5, 'Reconcile Q3 brand-owner settlement', 'Match settlement advice against invoices raised.',
        'DPT-FIN', 'high', 'in_progress', 'none', 6, 4),
    (6, 'NAFDAC renewal — batch documentation', 'Assemble the batch records for the three lines due for renewal.',
        'DPT-CMP', 'medium', 'todo', 'none', 0, 14),
    (7, 'Depot training — new picking flow', 'Run the new FEFO flow with the Ikeja team.',
        'DPT-HR', 'medium', 'completed', 'none', 12, -4),
    (8, 'Route profitability review', 'Cost per drop by route for the last quarter.',
        'DPT-LOG', 'low', 'todo', 'none', 0, 21),
    (9, 'Merchandiser photo sweep — Apapa', 'Weekly shelf photos for the six key accounts.',
        'DPT-SLS', 'low', 'completed', 'photo', 9, -2),
    (10, 'Damaged stock write-off schedule', 'Schedule and evidence for the quarter''s write-offs.',
        'DPT-WHS', 'medium', 'cancelled', 'none', 20, -6)
  ) as x(n, title, description, dept_code, priority, status, mode, starts_days_ago, due_in_days)
  join departments d on d.organization_id = v_org and d.code = x.dept_code
  on conflict (id) do nothing;

  -- Assignees: give each task one or two people from its own department.
  insert into task_assignees (task_id, employee_id)
  select t.id, e.id
  from tasks t
  join lateral (
    select e.id
    from employees e
    where e.organization_id = v_org
      and e.department_id = t.department_id
      and e.employee_no like 'CHF-10%'
    order by e.employee_no
    limit 2
  ) e on true
  where t.organization_id = v_org
    and t.id::text like '00000000-0000-4000-8005-%'
  on conflict do nothing;

  -- Field visits, on the three tasks that require location evidence.
  insert into field_visits (id, organization_id, task_id, employee_id, state,
                            submitted_at, latitude, longitude, accuracy_m, distance_m,
                            report, outcome, exception_codes,
                            reviewed_by, reviewed_at, review_reason)
  select
    ('00000000-0000-4000-8006-' || lpad(v.n::text, 12, '0'))::uuid,
    v_org, t.id, a.employee_id, v.state::field_visit_state,
    now() - (v.hours_ago || ' hours')::interval,
    v.lat, v.lng, v.accuracy, v.distance,
    v.report, v.outcome, v.exceptions,
    case when v.state in ('verified', 'returned') then v_admin end,
    case when v.state in ('verified', 'returned') then now() - interval '2 hours' end,
    v.review_reason
  from (values
    (1, 2, 'submitted', 26,  6.601755, 3.351480, 14.0,    22.0,
        'Planogram matched on four of six facings. Two Sebamed SKUs were behind own-brand; corrected and photographed.',
        'Compliant after correction', '{}'::text[], null),
    (2, 9, 'verified',  50,  6.443100, 3.395200, 11.0,    31.0,
        'Weekly sweep complete across all six accounts. Photos attached per account.',
        'All six visited', '{}'::text[], null),
    (3, 3, 'returned',  74,  6.512400, 3.290100, 180.0, 4200.0,
        'Visited the cluster and spoke to four of the six distributors.',
        'Partial coverage', array['outside_geofence','poor_accuracy'],
        'The photo only shows the shopfront and the fix is 4.2km from the listed address — please re-shoot at the stall with location on.')
  ) as v(n, task_n, state, hours_ago, lat, lng, accuracy, distance, report, outcome, exceptions, review_reason)
  join tasks t on t.id = ('00000000-0000-4000-8005-' || lpad(v.task_n::text, 12, '0'))::uuid
  join lateral (
    select ta.employee_id from task_assignees ta where ta.task_id = t.id limit 1
  ) a on true
  on conflict (id) do nothing;

  select count(*) into n from tasks where organization_id = v_org and id::text like '00000000-0000-4000-8005-%';
  raise notice 'tasks: %, field visits: %', n,
    (select count(*) from field_visits where organization_id = v_org);
end
$demo$;

-- ===========================================================================
-- Leave.
--
-- Balances for everyone against each capped leave type, then four requests
-- sitting at four different points in the chain — so the approval queue is
-- not empty and the timeline component has something to draw.
--
-- Written directly rather than through submit_leave_request(), because that
-- function takes the employee from the session and these employees have no
-- accounts. The balances below are therefore set to agree with the approved
-- request: `taken_days` moves only for the one that reached approved, which
-- is the rule the function enforces and D42 records.
-- ===========================================================================
do $demo$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_admin uuid;
  v_year  smallint := extract(year from current_date)::smallint;
  n integer;
begin
  select ur.user_id into v_admin
  from user_roles ur join roles r on r.id = ur.role_id
  where ur.organization_id = v_org and r.slug = 'management' limit 1;

  -- Entitlement for every employee against every capped type. Uncapped types
  -- (unpaid leave) are skipped: a balance row for them would imply a limit.
  insert into leave_balances (id, organization_id, employee_id, leave_type_id,
                              leave_year, entitled_days, taken_days)
  select
    ('00000000-0000-4000-8007-' || lpad((row_number() over (order by e.employee_no, lt.name))::text, 12, '0'))::uuid,
    v_org, e.id, lt.id, v_year, lt.annual_entitlement_days, 0
  from employees e
  cross join leave_types lt
  where e.organization_id = v_org
    and e.employee_no like 'CHF-10%'
    and lt.organization_id = v_org
    and lt.annual_entitlement_days is not null
  on conflict (employee_id, leave_type_id, leave_year) do nothing;

  insert into leave_requests (id, organization_id, employee_id, leave_type_id, status,
                              starts_on, ends_on, days_requested, reason,
                              submitted_at, decided_at)
  select
    ('00000000-0000-4000-8008-' || lpad(r.n::text, 12, '0'))::uuid,
    v_org, e.id, lt.id, r.status::leave_status,
    current_date + r.starts_in, current_date + r.ends_in, r.days, r.reason,
    now() - (r.submitted_days_ago || ' days')::interval,
    case when r.status in ('approved', 'declined')
         then now() - (r.submitted_days_ago || ' days')::interval + interval '1 day' end
  from (values
    (1, 'CHF-1003', 'Annual leave', 'pending_hod',  14, 20, 5, 'Family wedding in Enugu.',            2),
    (2, 'CHF-1016', 'Annual leave', 'pending_hr',    7, 11, 5, 'Short break before the peak season.', 6),
    (3, 'CHF-1019', 'Annual leave', 'approved',    -12, -8, 5, 'Annual leave — first tranche.',      25),
    (4, 'CHF-1012', 'Sick leave',   'declined',      3,  4, 2, 'Hospital appointment.',               4)
  ) as r(n, emp_no, type_name, status, starts_in, ends_in, days, reason, submitted_days_ago)
  join employees e  on e.organization_id = v_org and e.employee_no = r.emp_no
  join leave_types lt on lt.organization_id = v_org and lt.name = r.type_name
  on conflict (id) do nothing;

  -- The decisions behind those states. A decline must carry a reason; the
  -- table refuses one shorter than ten characters.
  insert into leave_approvals (id, organization_id, leave_request_id, stage, decision,
                               approver_id, note, decided_at)
  select
    ('00000000-0000-4000-8009-' || lpad(a.n::text, 12, '0'))::uuid,
    v_org,
    ('00000000-0000-4000-8008-' || lpad(a.request_n::text, 12, '0'))::uuid,
    a.stage::leave_stage, a.decision::approval_decision, v_admin, a.note,
    now() - (a.days_ago || ' days')::interval
  from (values
    -- The pending_hr request cleared its HOD stage; that is what makes it HR's.
    (1, 2, 'hod', 'approved', 'Cover arranged with the Ikeja team.', 5),
    -- The approved request cleared both.
    (2, 3, 'hod', 'approved', 'Fine — quiet period.',               24),
    (3, 3, 'hr',  'approved', 'Balance confirmed.',                 24),
    (4, 4, 'hod', 'declined', 'Stock-take week — could you move this to the following month?', 3)
  ) as a(n, request_n, stage, decision, note, days_ago)
  where exists (select 1 from leave_requests lr
                where lr.id = ('00000000-0000-4000-8008-' || lpad(a.request_n::text, 12, '0'))::uuid)
  on conflict (id) do nothing;

  -- A balance moves only on final approval (D42). Exactly one request here
  -- reached that state, so exactly one balance moves.
  update leave_balances b
  set taken_days = lr.days_requested
  from leave_requests lr
  where lr.id = '00000000-0000-4000-8008-000000000003'
    and b.employee_id = lr.employee_id
    and b.leave_type_id = lr.leave_type_id
    and b.leave_year = v_year
    and b.taken_days = 0;

  select count(*) into n from leave_requests where organization_id = v_org;
  raise notice 'leave: % balances, % requests', 
    (select count(*) from leave_balances where organization_id = v_org), n;
end
$demo$;

-- ===========================================================================
-- Payroll.
--
-- The figures are NOT written here. Both runs are costed by calculate_payroll(),
-- the same function the application calls, so the PAYE, pension and NHF on
-- these payslips are the product's real arithmetic against the seeded bands.
-- Hand-written numbers would make the tax engine look correct without ever
-- running it.
--
-- calculate_payroll() reads current_org_id() and has_permission() from the
-- request claims, exactly as it does per request through PostgREST, so the
-- claims are set here the way the access token hook would stamp them.
--
-- Two runs:
--   * last month  — published, with payslips, so employees have something to
--                   open and the payslip screen is not empty.
--   * this month  — costed and sitting in `processing`, which is where
--                   calculate_payroll() leaves a run, so the rest of the
--                   pipeline (submit, approve, publish) can be walked live.
--
-- The published run carries no submitted_by or approved_by. Separation of
-- duties needs two people and this deployment has one real account; naming
-- the same person as both would be a lie the table's own constraint exists to
-- prevent. A seeded history with those fields empty is honest about being
-- seeded. Anything done through the app still goes through advance_payroll().
-- ===========================================================================
do $demo$
declare
  v_org       uuid := '00000000-0000-4000-8000-000000000001';
  v_admin     uuid;
  v_last_id   uuid := '00000000-0000-4000-800a-000000000001';
  v_this_id   uuid := '00000000-0000-4000-800a-000000000002';
  v_last_start date := date_trunc('month', current_date - interval '1 month')::date;
  v_last_end   date := (date_trunc('month', current_date) - interval '1 day')::date;
  v_this_start date := date_trunc('month', current_date)::date;
  v_this_end   date := (date_trunc('month', current_date) + interval '1 month' - interval '1 day')::date;
  v_lines     integer;
begin
  select ur.user_id into v_admin
  from user_roles ur join roles r on r.id = ur.role_id
  where ur.organization_id = v_org and r.slug = 'management' limit 1;

  -- Claims as the access token hook would stamp them, so the costing function
  -- sees an organization and a permission set.
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_admin,
    'role', 'authenticated',
    'organization_id', v_org,
    'permissions', (select jsonb_agg(distinct rp.permission_slug)
                    from user_roles ur
                    join role_permissions rp on rp.role_id = ur.role_id
                    where ur.user_id = v_admin and ur.organization_id = v_org)
  )::text, true);

  insert into payroll_periods (id, organization_id, label, starts_on, ends_on, pay_date, status)
  values
    (v_last_id, v_org, to_char(v_last_start, 'FMMonth YYYY'), v_last_start, v_last_end,
     v_last_end, 'draft'),
    (v_this_id, v_org, to_char(v_this_start, 'FMMonth YYYY'), v_this_start, v_this_end,
     v_this_end, 'draft')
  on conflict (id) do nothing;

  -- Cost each run, but only if it has no lines yet. Status is not a safe
  -- guard here: calculate_payroll() moves a period from draft to processing,
  -- so a second run of this file would find "processing", recost the period,
  -- and its `delete from payroll_run_lines` would hit the payslips pointing
  -- at those lines. Absence of lines is the condition that actually means
  -- "not yet costed".
  if not exists (select 1 from payroll_run_lines where payroll_period_id = v_last_id) then
    v_lines := calculate_payroll(v_last_id);
    raise notice 'payroll: costed % lines for %', v_lines, to_char(v_last_start, 'FMMonth YYYY');
  end if;

  if not exists (select 1 from payroll_run_lines where payroll_period_id = v_this_id) then
    v_lines := calculate_payroll(v_this_id);
    raise notice 'payroll: costed % lines for %', v_lines, to_char(v_this_start, 'FMMonth YYYY');
  end if;

  -- Publish last month. See the note above on why no person is named.
  -- Both draft and processing are accepted because costing the run already
  -- moved it to processing.
  update payroll_periods
  set status = 'published', published_at = v_last_end + interval '9 hours'
  where id = v_last_id and status in ('draft', 'processing');

  -- Payslips for the published run. One per line, which is what the unique
  -- constraint on payroll_run_line_id enforces.
  insert into payslips (id, organization_id, payroll_run_line_id, employee_id, published_at)
  select
    ('00000000-0000-4000-800b-' || lpad((row_number() over (order by l.id))::text, 12, '0'))::uuid,
    v_org, l.id, l.employee_id, v_last_end + interval '9 hours'
  from payroll_run_lines l
  where l.payroll_period_id = v_last_id
  on conflict (payroll_run_line_id) do nothing;

  raise notice 'payroll: % payslips published',
    (select count(*) from payslips where organization_id = v_org);
end
$demo$;

-- ===========================================================================
-- Recruitment.
--
-- Two published roles so the public careers site has something on it, one
-- draft so the difference between draft and published is visible, and
-- applicants spread across the board including rejected and withdrawn — the
-- design keeps those visible and searchable rather than sweeping them away.
--
-- Applicant emails use example.com, which is reserved for exactly this and
-- can never reach a real inbox.
-- ===========================================================================
do $demo$
declare
  v_org   uuid := '00000000-0000-4000-8000-000000000001';
  v_admin uuid;
begin
  select ur.user_id into v_admin
  from user_roles ur join roles r on r.id = ur.role_id
  where ur.organization_id = v_org and r.slug = 'management' limit 1;

  insert into jobs (id, organization_id, title, slug, department_id, location,
                    employment_type, summary, description, responsibilities,
                    requirements, status, closes_on, published_at, created_by)
  select
    ('00000000-0000-4000-800c-' || lpad(j.n::text, 12, '0'))::uuid,
    v_org, j.title, j.slug, d.id, j.location, j.emp_type::employment_type,
    j.summary, j.description, j.responsibilities, j.requirements,
    j.status::job_status, current_date + j.closes_in,
    case when j.status = 'published' then now() - (j.posted_days_ago || ' days')::interval end,
    v_admin
  from (values
    (1, 'Field Sales Representative', 'field-sales-representative', 'DPT-SLS', 'Apapa, Lagos', 'full_time',
     'Own a route. Build the order book on it.',
     'You will carry a defined route across open market and modern trade, working the same customers every week until they know you and your lines.',
     'Call the route to plan. Take orders, resolve stock issues at the shelf, and photograph compliance at each visit. Report coverage daily.',
     'Two years in FMCG field sales, a smartphone, and the patience to build a route rather than chase one-off orders.',
     'published', 21, 6),
    (2, 'Warehouse Supervisor', 'warehouse-supervisor', 'DPT-WHS', 'Ikeja, Lagos', 'full_time',
     'Run the floor at Ikeja. FEFO, and no surprises at count.',
     'Responsible for receiving, put-away, picking accuracy and dispatch readiness at the Ikeja depot.',
     'Supervise the picking team. Enforce FEFO. Own the cycle count and reconcile variances before they become write-offs.',
     'Five years in warehousing, at least two supervising. Comfortable with a WMS and with a clipboard when the WMS is down.',
     'published', 30, 2),
    (3, 'Head of Trade Marketing', 'head-of-trade-marketing', 'DPT-SLS', 'Victoria Island, Lagos', 'full_time',
     'Still being written.',
     null, null, null,
     'draft', 45, null)
  ) as j(n, title, slug, dept_code, location, emp_type, summary, description,
         responsibilities, requirements, status, closes_in, posted_days_ago)
  join departments d on d.organization_id = v_org and d.code = j.dept_code
  on conflict (id) do nothing;

  insert into job_applications (id, organization_id, job_id, first_name, last_name,
                                email, phone, location, cover_letter, source, stage,
                                created_at)
  select
    ('00000000-0000-4000-800d-' || lpad(a.n::text, 12, '0'))::uuid,
    v_org,
    ('00000000-0000-4000-800c-' || lpad(a.job_n::text, 12, '0'))::uuid,
    a.first_name, a.last_name, a.email, a.phone, a.location, a.cover_letter,
    'careers_site', a.stage::application_stage,
    now() - (a.days_ago || ' days')::interval
  from (values
    (1, 1, 'Chinedu',  'Anyanwu',  'chinedu.anyanwu@example.com',  '+234 805 111 0001', 'Surulere, Lagos',
     'Four years on open-market routes in Lagos Island. I know the Trade Fair cluster well.', 'interview',   5),
    (2, 1, 'Aisha',    'Mohammed', 'aisha.mohammed@example.com',   '+234 805 111 0002', 'Yaba, Lagos',
     'Two years merchandising for a personal-care distributor, looking to move into a route.', 'shortlisted', 4),
    (3, 1, 'Olumide',  'Ajayi',    'olumide.ajayi@example.com',    '+234 805 111 0003', 'Ikorodu, Lagos',
     'I have run my own distribution for three years and want to work a bigger book.', 'screening', 3),
    (4, 1, 'Ndidi',    'Obiora',   'ndidi.obiora@example.com',     '+234 805 111 0004', 'Ajah, Lagos',
     null, 'applied', 1),
    (5, 1, 'Femi',     'Oladipo',  'femi.oladipo@example.com',     '+234 805 111 0005', 'Ibadan, Oyo',
     'Relocating to Lagos next month.', 'rejected', 9),
    (6, 2, 'Ibrahim',  'Lawal',    'ibrahim.lawal@example.com',    '+234 805 111 0006', 'Ikeja, Lagos',
     'Six years at a 3PL, last two as shift supervisor. FEFO is second nature.', 'offered', 7),
    (7, 2, 'Patience', 'Effiong',  'patience.effiong@example.com', '+234 805 111 0007', 'Agege, Lagos',
     'Stock controller for four years; I want the supervision step.', 'interview', 6),
    (8, 2, 'Yusuf',    'Garba',    'yusuf.garba@example.com',      '+234 805 111 0008', 'Ikeja, Lagos',
     null, 'applied', 2),
    (9, 2, 'Rita',     'Chukwu',   'rita.chukwu@example.com',      '+234 805 111 0009', 'Ogba, Lagos',
     'Withdrawing — I accepted another offer, but I would like to be considered next time.', 'withdrawn', 8)
  ) as a(n, job_n, first_name, last_name, email, phone, location, cover_letter, stage, days_ago)
  on conflict (id) do nothing;

  raise notice 'recruitment: % roles (% published), % applicants',
    (select count(*) from jobs where organization_id = v_org),
    (select count(*) from jobs where organization_id = v_org and status = 'published'),
    (select count(*) from job_applications where organization_id = v_org);
end
$demo$;

-- ===========================================================================
-- Done.
-- ===========================================================================
do $demo$
declare v_org uuid := '00000000-0000-4000-8000-000000000001';
begin
  raise notice '---';
  raise notice 'Demo data loaded. Every person in it is fictional.';
  raise notice 'Remove it with supabase/setup/demo-seed-remove.sql.';
end
$demo$;
