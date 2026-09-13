-- 0023_payroll_actions
--
-- Payroll calculation and the six-status pipeline.
--
-- All arithmetic is here, in numeric. Nothing about a payslip is computed in
-- JavaScript: floating point is fine for a progress bar and wrong for money,
-- and the figure an employee is paid should come from one place.

-- Progressive tax on an annual amount, from the band table.
--
-- Each band taxes only the slice of income that falls inside it — that is
-- what "progressive" means, and computing it as a single rate on the whole
-- amount is the classic way to get it wrong.
create or replace function calculate_paye_annual(
  p_organization_id uuid,
  p_annual_taxable  numeric,
  p_on_date         date
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(round(sum(
    greatest(
      least(p_annual_taxable, coalesce(b.upper_bound, p_annual_taxable)) - b.lower_bound,
      0
    ) * b.rate_percent / 100
  ), 2), 0)
  from paye_bands b
  where b.organization_id = p_organization_id
    and b.effective_from <= p_on_date
    and (b.effective_to is null or b.effective_to > p_on_date)
    and b.lower_bound < p_annual_taxable;
$$;

comment on function calculate_paye_annual is
  'Progressive tax from the band table: each band taxes only the slice of '
  'income inside it. Returns zero when no bands are configured — the caller '
  'must not treat that as a computed tax of nil.';

create or replace function statutory_rate(
  p_organization_id uuid, p_code text, p_on_date date
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select rate_percent from statutory_rates
    where organization_id = p_organization_id
      and code = p_code
      and effective_from <= p_on_date
      and (effective_to is null or effective_to > p_on_date)
    order by effective_from desc
    limit 1
  ), 0);
$$;

-- Build (or rebuild) the lines for a run.
--
-- Only legal while the run is draft or processing; the trigger in 0022
-- refuses once it is approved. Rebuilding is deliberately allowed before
-- then — that is what "processing" is for.
create or replace function calculate_payroll(p_period_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_period   payroll_periods;
  v_employee record;
  v_lines    integer := 0;
  v_pension_ee numeric; v_pension_er numeric; v_nhf_rate numeric;
begin
  if not has_permission('payroll.process') then
    raise exception 'payroll.process is required' using errcode = 'insufficient_privilege';
  end if;

  select * into v_period from payroll_periods
  where id = p_period_id and organization_id = v_org;
  if not found then
    raise exception 'Period not found' using errcode = 'no_data_found';
  end if;

  if v_period.status not in ('draft', 'processing') then
    raise exception 'A % run cannot be recalculated', v_period.status
      using errcode = 'check_violation';
  end if;

  v_pension_ee := statutory_rate(v_org, 'pension_employee', v_period.ends_on);
  v_pension_er := statutory_rate(v_org, 'pension_employer', v_period.ends_on);
  v_nhf_rate   := statutory_rate(v_org, 'nhf', v_period.ends_on);

  delete from payroll_run_lines where payroll_period_id = p_period_id;

  for v_employee in
    select e.id, e.employee_no,
           e.first_name || ' ' || e.last_name as full_name,
           d.name as department_name,
           coalesce((
             select c.basic_salary from employee_compensation c
             where c.employee_id = e.id
               and c.effective_from <= v_period.ends_on
               and (c.effective_to is null or c.effective_to > v_period.ends_on)
             order by c.effective_from desc limit 1
           ), 0) as basic
    from employees e
    left join departments d on d.id = e.department_id
    where e.organization_id = v_org
      and e.employment_status <> 'exited'
  loop
    declare
      v_earnings   numeric := 0;
      v_taxable_extra numeric := 0;
      v_other_ded  numeric := 0;
      v_gross      numeric;
      v_paye       numeric;
      v_pen_ee_amt numeric;
      v_pen_er_amt numeric;
      v_nhf_amt    numeric;
      v_adjust     numeric := 0;
      v_total_ded  numeric;
      v_earn_json  jsonb := '[]'::jsonb;
      v_ded_json   jsonb := '[]'::jsonb;
    begin
      -- Earnings and deductions in effect for this period.
      select
        coalesce(sum(amount) filter (where kind in ('recurring_earning','one_time_earning')), 0),
        coalesce(sum(amount) filter (where kind in ('recurring_earning','one_time_earning') and taxable), 0),
        coalesce(sum(amount) filter (where kind in ('recurring_deduction','one_time_deduction')), 0),
        coalesce(jsonb_agg(jsonb_build_object('name', name, 'amount', amount))
                 filter (where kind in ('recurring_earning','one_time_earning')), '[]'::jsonb),
        coalesce(jsonb_agg(jsonb_build_object('name', name, 'amount', amount))
                 filter (where kind in ('recurring_deduction','one_time_deduction')), '[]'::jsonb)
      into v_earnings, v_taxable_extra, v_other_ded, v_earn_json, v_ded_json
      from salary_components
      where employee_id = v_employee.id
        and coalesce(effective_from, v_period.starts_on) <= v_period.ends_on
        and (effective_to is null or effective_to > v_period.starts_on);

      -- Adjustments on this run, with their reasons already recorded.
      select coalesce(sum(amount), 0) into v_adjust
      from payroll_adjustments
      where payroll_period_id = p_period_id and employee_id = v_employee.id;

      v_gross := round(v_employee.basic + v_earnings + greatest(v_adjust, 0), 2);

      v_pen_ee_amt := round(v_employee.basic * v_pension_ee / 100, 2);
      v_pen_er_amt := round(v_employee.basic * v_pension_er / 100, 2);
      v_nhf_amt    := round(v_employee.basic * v_nhf_rate / 100, 2);

      -- Pension and NHF reduce taxable pay before PAYE is applied. Annualised
      -- for the band lookup, then divided back — bands are annual figures.
      v_paye := round(
        calculate_paye_annual(
          v_org,
          greatest((v_employee.basic + v_taxable_extra - v_pen_ee_amt - v_nhf_amt) * 12, 0),
          v_period.ends_on
        ) / 12, 2);

      v_total_ded := round(
        v_paye + v_pen_ee_amt + v_nhf_amt + v_other_ded + greatest(-v_adjust, 0), 2);

      insert into payroll_run_lines (
        organization_id, payroll_period_id, employee_id,
        employee_no, employee_name, department_name,
        basic_salary, total_earnings, gross_pay,
        paye, pension_employee, pension_employer, nhf,
        other_deductions, total_deductions, net_pay,
        currency_code, earning_lines, deduction_lines
      )
      values (
        v_org, p_period_id, v_employee.id,
        v_employee.employee_no, v_employee.full_name, v_employee.department_name,
        v_employee.basic, v_earnings, v_gross,
        v_paye, v_pen_ee_amt, v_pen_er_amt, v_nhf_amt,
        round(v_other_ded + greatest(-v_adjust, 0), 2), v_total_ded,
        round(v_gross - v_total_ded, 2),
        v_period.currency_code, v_earn_json, v_ded_json
      );

      v_lines := v_lines + 1;
    end;
  end loop;

  update payroll_periods set status = 'processing' where id = p_period_id;

  perform write_audit('payroll.calculate', 'payroll_period', p_period_id::text,
    jsonb_build_object('lines', v_lines));

  return v_lines;
end;
$$;

-- Advance the pipeline. Each transition has its own permission and its own
-- rule; there is no generic "set status".
create or replace function advance_payroll(p_period_id uuid, p_to payroll_status)
returns payroll_periods
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org    uuid := current_org_id();
  v_period payroll_periods;
begin
  select * into v_period from payroll_periods
  where id = p_period_id and organization_id = v_org;
  if not found then
    raise exception 'Period not found' using errcode = 'no_data_found';
  end if;

  if p_to = 'review' then
    if v_period.status <> 'processing' then
      raise exception 'Only a run in processing can be sent for review'
        using errcode = 'check_violation';
    end if;
    if not has_permission('payroll.process') then
      raise exception 'payroll.process is required' using errcode = 'insufficient_privilege';
    end if;
    if not exists (select 1 from payroll_run_lines where payroll_period_id = p_period_id) then
      raise exception 'This run has no lines to review' using errcode = 'check_violation';
    end if;
    update payroll_periods
    set status = 'review', submitted_by = auth.uid(), submitted_at = now()
    where id = p_period_id returning * into v_period;

  elsif p_to = 'approved' then
    if v_period.status <> 'review' then
      raise exception 'Only a run in review can be approved' using errcode = 'check_violation';
    end if;
    if not has_permission('payroll.approve') then
      raise exception 'payroll.approve is required' using errcode = 'insufficient_privilege';
    end if;
    -- The separation of duties. The table constraint catches it too; this
    -- raises the message a person can act on.
    if v_period.submitted_by = auth.uid() then
      raise exception
        'You submitted this run, so someone else has to approve it'
        using errcode = 'insufficient_privilege';
    end if;
    update payroll_periods
    set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = p_period_id returning * into v_period;

  elsif p_to = 'published' then
    if v_period.status <> 'approved' then
      raise exception 'Only an approved run can be published' using errcode = 'check_violation';
    end if;
    if not has_permission('payroll.publish') then
      raise exception 'payroll.publish is required' using errcode = 'insufficient_privilege';
    end if;
    update payroll_periods
    set status = 'published', published_by = auth.uid(), published_at = now()
    where id = p_period_id returning * into v_period;

    -- Issue the payslips. This is the irreversible step.
    insert into payslips (organization_id, payroll_run_line_id, employee_id)
    select organization_id, id, employee_id
    from payroll_run_lines where payroll_period_id = p_period_id
    on conflict (payroll_run_line_id) do nothing;

  elsif p_to = 'closed' then
    if v_period.status <> 'published' then
      raise exception 'Only a published run can be closed' using errcode = 'check_violation';
    end if;
    if not has_permission('payroll.process') then
      raise exception 'payroll.process is required' using errcode = 'insufficient_privilege';
    end if;
    update payroll_periods set status = 'closed', closed_at = now()
    where id = p_period_id returning * into v_period;

  else
    raise exception 'Payroll does not move to % from here', p_to
      using errcode = 'check_violation';
  end if;

  perform write_audit('payroll.' || p_to::text, 'payroll_period', p_period_id::text,
    jsonb_build_object('from', v_period.status, 'label', v_period.label));

  return v_period;
end;
$$;

grant execute on function calculate_payroll(uuid) to authenticated;
grant execute on function advance_payroll(uuid, payroll_status) to authenticated;
grant execute on function calculate_paye_annual(uuid, numeric, date) to authenticated;
