-- Employee and department RLS.
--
-- The two rules this phase most needs to get right:
--   * An HOD sees their own department and nobody else's.
--   * HR can edit a person completely and still cannot read their salary.
--
-- Depends on the fixtures and helpers created by 10_rls_test.sql.

set client_min_messages = notice;

do $$
declare
  f record;
  org_a uuid; org_b uuid;
  dept_sales uuid; dept_finance uuid; dept_b uuid;
  u_hod2 uuid;
  emp_sales uuid; emp_finance uuid;
begin
  select * into f from fixture;
  org_a := f.org_a; org_b := f.org_b;

  insert into departments (organization_id, code, name)
  values (org_a, 'DPT-SLS', 'Sales') returning id into dept_sales;
  insert into departments (organization_id, code, name)
  values (org_a, 'DPT-FIN', 'Finance') returning id into dept_finance;
  insert into departments (organization_id, code, name)
  values (org_b, 'DPT-OPS', 'Operations') returning id into dept_b;

  -- The HOD from the shared fixture heads Sales only.
  insert into auth.users (email) values ('tunde@chfheron.com') returning id into u_hod2;
  insert into organization_members (organization_id, user_id, status)
    values (org_a, u_hod2, 'active');
  insert into user_roles (organization_id, user_id, role_id)
    select org_a, u_hod2, id from roles where organization_id = org_a and slug = 'hod';
  insert into department_heads (organization_id, department_id, user_id)
    values (org_a, dept_sales, u_hod2);

  insert into employees (organization_id, employee_no, first_name, last_name,
                         department_id, hire_date, user_id)
  values (org_a, 'EMP-0118', 'Adaeze', 'Okonkwo', dept_sales, date '2022-01-12', null)
  returning id into emp_sales;

  insert into employees (organization_id, employee_no, first_name, last_name,
                         department_id, hire_date, user_id)
  values (org_a, 'EMP-0044', 'Ifeoma', 'Eze', dept_finance, date '2018-02-02', f.u_acct)
  returning id into emp_finance;

  -- The employee from the shared fixture, so view_self has something to find.
  insert into employees (organization_id, employee_no, first_name, last_name,
                         department_id, hire_date, user_id)
  values (org_a, 'EMP-0142', 'Chidi', 'Uzo', dept_sales, date '2023-03-03', f.u_emp);

  insert into employees (organization_id, employee_no, first_name, last_name, hire_date)
  values (org_b, 'SAH-0001', 'Rival', 'Person', date '2024-01-01');

  insert into employee_compensation (organization_id, employee_id, basic_salary, effective_from)
  values (org_a, emp_sales, 380000.00, date '2022-01-12'),
         (org_a, emp_finance, 840000.00, date '2018-02-02');

  -- === HOD sees their department, and only theirs ==========================
  perform set_config('request.jwt.claims', claims_for(u_hod2, org_a)::text, true);
  set local role authenticated;

  perform assert(
    (select count(*) from employees) = 2,
    'HOD sees the two employees in the department they head');
  perform assert(
    (select count(*) from employees where department_id = dept_finance) = 0,
    'HOD sees nobody in a department they do not head');
  perform assert(
    (select count(*) from employees where organization_id = org_b) = 0,
    'HOD sees nobody in another tenant');
  perform assert(
    (select count(*) from employee_compensation) = 0,
    'HOD cannot read salary for anyone, including their own team');
  reset role;

  -- === HR: full people access, zero salary access ==========================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;

  perform assert(
    (select count(*) from employees) = 3,
    'HR sees every employee in the organization');
  perform assert(
    (select count(*) from employee_compensation) = 0,
    'HR cannot read salary — the matrix row that is easiest to break');
  reset role;

  -- === Accounts: salary yes, people record read-only =======================
  perform set_config('request.jwt.claims', claims_for(f.u_acct, org_a)::text, true);
  set local role authenticated;

  perform assert(
    (select count(*) from employee_compensation) = 2,
    'Accounts can read salary for the organization');
  perform assert(
    denies(claims_for(f.u_acct, org_a),
      'insert into employees (organization_id, employee_no, first_name, last_name, hire_date)
       values (''' || org_a || ''', ''EMP-9999'', ''New'', ''Person'', current_date)'),
    'Accounts cannot create an employee');
  reset role;

  -- === Employee: own row, own salary, nothing else =========================
  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;

  perform assert(
    (select count(*) from employees) = 1,
    'Employee sees exactly one employee row — their own');
  perform assert(
    (select employee_no from employees) = 'EMP-0142',
    'The row an Employee sees is theirs');
  perform assert(
    (select count(*) from employee_compensation) = 0,
    'Employee has no compensation row of their own to see yet');
  reset role;

  -- Give the employee a salary and confirm own-only actually resolves.
  insert into employee_compensation (organization_id, employee_id, basic_salary, effective_from)
  select org_a, id, 310000.00, date '2023-03-03' from employees where employee_no = 'EMP-0142';

  perform set_config('request.jwt.claims', claims_for(f.u_emp, org_a)::text, true);
  set local role authenticated;
  perform assert(
    (select count(*) from employee_compensation) = 1,
    'Employee sees their own salary and no one else''s');
  perform assert(
    (select basic_salary from employee_compensation) = 310000.00,
    'The salary an Employee sees is their own figure');
  reset role;

  -- === Tenant isolation on the people record ===============================
  perform set_config('request.jwt.claims', claims_for(f.u_other, org_b)::text, true);
  set local role authenticated;
  perform assert(
    (select count(*) from employees) = 1,
    'The other tenant sees only its own employee');
  perform assert(
    (select count(*) from employee_compensation) = 0,
    'The other tenant sees none of Tenant A''s salaries');
  perform assert(
    (select count(*) from departments) = 1,
    'Departments are tenant-scoped');
  reset role;

  -- === Emergency contacts are narrower than the directory ==================
  insert into employee_emergency_contacts (employee_id, name, phone)
  values (emp_sales, 'Next Of Kin', '+2348000000000');

  perform set_config('request.jwt.claims', claims_for(u_hod2, org_a)::text, true);
  set local role authenticated;
  perform assert(
    (select count(*) from employee_emergency_contacts) = 0,
    'An HOD cannot read next-of-kin details for their own team');
  reset role;

  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  perform assert(
    (select count(*) from employee_emergency_contacts) = 1,
    'HR can read next-of-kin details');
  reset role;

  -- === Nobody can delete an employee =======================================
  perform assert(
    denies(claims_for(f.u_hr, org_a),
           'delete from employees where employee_no = ''EMP-0118'''),
    'Employees cannot be deleted, only exited — no delete policy exists');

  raise notice '--- employee assertions passed ---';
end
$$;
