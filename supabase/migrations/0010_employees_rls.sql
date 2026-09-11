-- 0010_employees_rls
--
-- Policies for the people record.
--
-- Three scopes appear here and they are genuinely different, not a gradient:
--
--   view_all         the whole organization
--   view_department  only departments the caller heads
--   view_self        only the caller's own row
--
-- An Employee holds only the third. That is not a weaker Read — it is the
-- scope that lets them see their own payslip inside a module they otherwise
-- cannot open at all.

alter table departments                  enable row level security;
alter table positions                    enable row level security;
alter table department_heads             enable row level security;
alter table employees                    enable row level security;
alter table employee_emergency_contacts  enable row level security;
alter table employee_compensation        enable row level security;
alter table employee_documents           enable row level security;
alter table shift_patterns               enable row level security;
alter table employee_shifts              enable row level security;

alter table departments                 force row level security;
alter table positions                   force row level security;
alter table department_heads            force row level security;
alter table employees                   force row level security;
alter table employee_compensation       force row level security;
alter table employee_documents          force row level security;
alter table shift_patterns              force row level security;
alter table employee_shifts             force row level security;


-- ---------------------------------------------------------------------------
-- departments and positions
--
-- Readable by anyone with departments.view. Structure is not sensitive — an
-- employee needs to know which departments exist to read a directory — but it
-- is still tenant-scoped.
-- ---------------------------------------------------------------------------
create policy departments_select on departments
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('departments.view'));

create policy departments_manage on departments
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('departments.manage'))
  with check (organization_id = current_org_id() and has_permission('departments.manage'));

create policy positions_select on positions
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('departments.view'));

create policy positions_manage on positions
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('departments.manage'))
  with check (organization_id = current_org_id() and has_permission('departments.manage'));

-- Headship is visible to anyone who can see departments — knowing who runs a
-- department is ordinary organisational information. Changing it is not.
create policy department_heads_select on department_heads
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('departments.view'));

create policy department_heads_manage on department_heads
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('departments.members.manage'))
  with check (organization_id = current_org_id() and has_permission('departments.members.manage'));


-- ---------------------------------------------------------------------------
-- employees — the three scopes, as three separate policies.
--
-- Postgres ORs permissive policies together, which is exactly the union
-- semantics the matrix calls for: a user who is both an HOD and an employee
-- sees their department and themselves.
-- ---------------------------------------------------------------------------
create policy employees_select_all on employees
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('employees.view_all'));

create policy employees_select_department on employees
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('employees.view_department')
    and department_id in (select headed_department_ids())
  );

create policy employees_select_self on employees
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('employees.view_self')
    and user_id = auth.uid()
  );

create policy employees_insert on employees
  for insert to authenticated
  with check (organization_id = current_org_id() and has_permission('employees.create'));

create policy employees_update on employees
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('employees.update'))
  with check (organization_id = current_org_id() and has_permission('employees.update'));

-- No delete policy, anywhere. Employees are deactivated by setting
-- employment_status to 'exited'; the record and its history remain.


-- ---------------------------------------------------------------------------
-- emergency contacts — personal data, so narrower than the directory: HR and
-- Management who can update people, or the employee themselves.
--
-- An HOD deliberately does NOT get this. Heading a department is a reason to
-- see who is in it, not a reason to hold their next of kin.
-- ---------------------------------------------------------------------------
create policy emergency_contacts_select on employee_emergency_contacts
  for select to authenticated
  using (
    exists (
      select 1 from employees e
      where e.id = employee_emergency_contacts.employee_id
        and e.organization_id = current_org_id()
        and (has_permission('employees.update') or e.user_id = auth.uid())
    )
  );

create policy emergency_contacts_manage on employee_emergency_contacts
  for all to authenticated
  using (
    exists (
      select 1 from employees e
      where e.id = employee_emergency_contacts.employee_id
        and e.organization_id = current_org_id()
        and (has_permission('employees.update') or e.user_id = auth.uid())
    )
  )
  with check (
    exists (
      select 1 from employees e
      where e.id = employee_emergency_contacts.employee_id
        and e.organization_id = current_org_id()
        and (has_permission('employees.update') or e.user_id = auth.uid())
    )
  );


-- ---------------------------------------------------------------------------
-- compensation — the row that makes "HR has no payroll access" real.
--
-- Only payroll.view_all, or the employee's own record. HR holds neither, so
-- HR cannot read salary even though HR can edit everything else about the
-- same person. That is the design's matrix, enforced where it cannot be
-- bypassed by a forgotten UI check.
-- ---------------------------------------------------------------------------
create policy compensation_select_payroll on employee_compensation
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy compensation_select_self on employee_compensation
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('payroll.view_self')
    and employee_id = my_employee_id()
  );

create policy compensation_manage on employee_compensation
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.manage_components'))
  with check (organization_id = current_org_id() and has_permission('payroll.manage_components'));


-- ---------------------------------------------------------------------------
-- employee documents — own file always; everyone's needs the manage
-- permission. HR holds it, an HOD does not.
-- ---------------------------------------------------------------------------
create policy employee_documents_select on employee_documents
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('employees.documents.manage')
      or employee_id = my_employee_id()
    )
  );

create policy employee_documents_manage on employee_documents
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('employees.documents.manage'))
  with check (organization_id = current_org_id() and has_permission('employees.documents.manage'));


-- ---------------------------------------------------------------------------
-- shifts — readable by anyone who can see attendance at any scope, since a
-- shift is what "late" is measured against. Managed with settings.
-- ---------------------------------------------------------------------------
create policy shift_patterns_select on shift_patterns
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('attendance.view_all')
      or has_permission('attendance.view_department')
      or has_permission('attendance.view_self')
    )
  );

create policy shift_patterns_manage on shift_patterns
  for all to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_structure'))
  )
  with check (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_structure'))
  );

create policy employee_shifts_select on employee_shifts
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('attendance.view_all')
      or employee_id = my_employee_id()
      or exists (
        select 1 from employees e
        where e.id = employee_shifts.employee_id
          and has_permission('attendance.view_department')
          and e.department_id in (select headed_department_ids())
      )
    )
  );

create policy employee_shifts_manage on employee_shifts
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('employees.update'))
  with check (organization_id = current_org_id() and has_permission('employees.update'));


grant select on departments, positions, department_heads, employees,
                employee_emergency_contacts, employee_compensation,
                employee_documents, shift_patterns, employee_shifts
  to authenticated;

grant insert, update on departments, positions, department_heads, employees,
                        employee_emergency_contacts, employee_compensation,
                        employee_documents, shift_patterns, employee_shifts
  to authenticated;

grant delete on department_heads, employee_emergency_contacts,
                employee_documents, employee_shifts
  to authenticated;
