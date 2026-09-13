-- 0021_leave_rls
--
-- Leave policies.
--
-- Everything that advances a request goes through the functions in 0020, so
-- there is no update policy on leave_requests at all: the two-stage chain,
-- the self-approval block and the balance rule cannot be routed around by a
-- direct write.

alter table leave_types     enable row level security;
alter table leave_balances  enable row level security;
alter table leave_requests  enable row level security;
alter table leave_approvals enable row level security;

alter table leave_types     force row level security;
alter table leave_balances  force row level security;
alter table leave_requests  force row level security;
alter table leave_approvals force row level security;

-- Leave types are readable by everyone in the tenant — you cannot request
-- leave without knowing what kinds exist. HR owns them, per "Some areas".
create policy leave_types_select on leave_types
  for select to authenticated
  using (organization_id = current_org_id());

create policy leave_types_manage on leave_types
  for all to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('leave.manage_policy') or has_permission('settings.manage_structure'))
  )
  with check (
    organization_id = current_org_id()
    and (has_permission('leave.manage_policy') or has_permission('settings.manage_structure'))
  );

-- Balances: your own always; everyone's needs the org-wide scope. An HOD sees
-- their department's, because coverage is their judgement to make.
create policy leave_balances_select_self on leave_balances
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('leave.view_self')
    and employee_id = my_employee_id()
  );

create policy leave_balances_select_all on leave_balances
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('leave.view_all'));

create policy leave_balances_select_department on leave_balances
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('leave.view_department')
    and exists (
      select 1 from employees e
      where e.id = leave_balances.employee_id
        and e.department_id in (select headed_department_ids())
    )
  );

create policy leave_balances_manage on leave_balances
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('leave.manage_policy'))
  with check (organization_id = current_org_id() and has_permission('leave.manage_policy'));

-- Requests, three scopes as usual.
create policy leave_requests_select_self on leave_requests
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('leave.view_self')
    and employee_id = my_employee_id()
  );

create policy leave_requests_select_all on leave_requests
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('leave.view_all'));

create policy leave_requests_select_department on leave_requests
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('leave.view_department')
    and exists (
      select 1 from employees e
      where e.id = leave_requests.employee_id
        and e.department_id in (select headed_department_ids())
    )
  );

-- No insert, update or delete policy. submit_leave_request(),
-- decide_leave_request() and cancel_leave_request() are the only ways in, and
-- they are security definer.

-- The decision history is visible to anyone who can see the request it
-- belongs to. An employee sees who approved their leave and what was said.
create policy leave_approvals_select on leave_approvals
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from leave_requests r where r.id = leave_approvals.leave_request_id
    )
  );

-- Written only by decide_leave_request(). Never edited, never deleted.

grant select on leave_types, leave_balances, leave_requests, leave_approvals
  to authenticated;
grant insert, update, delete on leave_types, leave_balances to authenticated;
