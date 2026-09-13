-- 0024_payroll_rls
--
-- Payroll policies.
--
-- The matrix row this enforces: HR has NO payroll access at all, and an
-- Employee sees only their own payslip — inside a module they otherwise
-- cannot open. That "own only" scope is why payslips get their own policy
-- rather than inheriting from the run.

alter table statutory_rates     enable row level security;
alter table paye_bands          enable row level security;
alter table salary_components   enable row level security;
alter table payroll_periods     enable row level security;
alter table payroll_run_lines   enable row level security;
alter table payroll_adjustments enable row level security;
alter table payslips            enable row level security;

alter table statutory_rates     force row level security;
alter table paye_bands          force row level security;
alter table salary_components   force row level security;
alter table payroll_periods     force row level security;
alter table payroll_run_lines   force row level security;
alter table payroll_adjustments force row level security;
alter table payslips            force row level security;

-- Rates and bands: readable by anyone who can see payroll, managed by
-- whoever owns payroll settings (Accounts' area, not HR's).
create policy statutory_rates_select on statutory_rates
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy statutory_rates_manage on statutory_rates
  for all to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_payroll'))
  )
  with check (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_payroll'))
  );

create policy paye_bands_select on paye_bands
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy paye_bands_manage on paye_bands
  for all to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_payroll'))
  )
  with check (
    organization_id = current_org_id()
    and (has_permission('settings.manage') or has_permission('settings.manage_payroll'))
  );

-- Salary components carry pay information, so they follow the same rule as
-- compensation: payroll access, or your own.
create policy salary_components_select on salary_components
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('payroll.view_all')
      or (has_permission('payroll.view_self') and employee_id = my_employee_id())
    )
  );

create policy salary_components_manage on salary_components
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.manage_components'))
  with check (organization_id = current_org_id() and has_permission('payroll.manage_components'));

create policy payroll_periods_select on payroll_periods
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy payroll_periods_insert on payroll_periods
  for insert to authenticated
  with check (organization_id = current_org_id() and has_permission('payroll.create'));

-- Status changes go through advance_payroll(), which enforces the order and
-- the separation of duties. This covers editing labels and dates on a run
-- that has not yet been submitted.
create policy payroll_periods_update on payroll_periods
  for update to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('payroll.process')
    and status in ('draft', 'processing')
  )
  with check (organization_id = current_org_id() and has_permission('payroll.process'));

create policy payroll_run_lines_select on payroll_run_lines
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

-- Lines are written only by calculate_payroll(). No client-facing insert.

create policy payroll_adjustments_select on payroll_adjustments
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

create policy payroll_adjustments_insert on payroll_adjustments
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('payroll.process')
    and created_by = auth.uid()
    -- An adjustment on a locked run would silently not apply, because the
    -- lines cannot be recalculated. Refuse it rather than accept a no-op.
    and exists (
      select 1 from payroll_periods p
      where p.id = payroll_adjustments.payroll_period_id
        and p.status in ('draft', 'processing')
    )
  );

-- Payslips. The "own only" scope: an Employee sees theirs and nobody else's,
-- and cannot see the run it came from.
create policy payslips_select_own on payslips
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('payroll.view_self')
    and employee_id = my_employee_id()
  );

create policy payslips_select_all on payslips
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('payroll.view_all'));

-- The run line behind an employee's own payslip has to be readable, or the
-- payslip is a row with no figures on it.
create policy payroll_run_lines_select_own on payroll_run_lines
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('payroll.view_self')
    and employee_id = my_employee_id()
    and exists (select 1 from payslips s where s.payroll_run_line_id = payroll_run_lines.id)
  );

grant select on statutory_rates, paye_bands, salary_components, payroll_periods,
                payroll_run_lines, payroll_adjustments, payslips
  to authenticated;
grant insert, update, delete on statutory_rates, paye_bands, salary_components to authenticated;
grant insert, update on payroll_periods to authenticated;
grant insert on payroll_adjustments to authenticated;
