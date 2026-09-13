-- 0022_payroll
--
-- Payroll. Source: Phase 6 - Payroll, Recruitment, Documents, and the
-- statutory rates in Phase 7 settings.
--
-- The highest correctness risk in the product, so three things are structural
-- rather than conventional:
--
--   1. Money is numeric. Never float — 0.1 + 0.2 costing someone a kobo is
--      not a rounding curiosity when it is their salary.
--   2. A run line is a SNAPSHOT. Every figure that made up a payslip is
--      stored on it, so a raise next March cannot alter what December paid.
--   3. Publishing is irreversible, and the pipeline enforces who may do what.
--
-- What this module deliberately does NOT do: present its output as statutory
-- compliance. Rates are configurable data supplied by the client, and the
-- brief excludes filing, remittance and pension APIs from MVP.

create type payroll_status as enum (
  'draft',       -- generated from contracts; nothing locked
  'processing',  -- Accounts is working through it
  'review',      -- figures complete, awaiting a second pair of eyes
  'approved',    -- signed off; figures locked
  'published',   -- payslips visible to employees; irreversible
  'closed'       -- fully read-only
);

create type salary_component_kind as enum (
  'recurring_earning',
  'one_time_earning',
  'recurring_deduction',
  'one_time_deduction'
);

-- Statutory rates, effective-dated.
--
-- Stored as data because they change, and because they are the client's to
-- state. The seeded values come from the design and must be confirmed against
-- current FIRS/PenCom/NHF guidance before anyone is paid from them.
create table statutory_rates (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code            text not null check (code in ('pension_employee', 'pension_employer', 'nhf')),
  rate_percent    numeric(6, 3) not null check (rate_percent >= 0 and rate_percent <= 100),
  effective_from  date not null,
  effective_to    date,
  created_at      timestamptz not null default now(),
  constraint statutory_period_valid check (effective_to is null or effective_to > effective_from)
);

create index statutory_rates_lookup on statutory_rates (organization_id, code, effective_from desc);

-- Progressive tax bands. Generic rather than Nigeria-specific: a band table
-- can express any progressive schedule, and hard-coding one country's law
-- into a function would make it a lie the moment it changed.
create table paye_bands (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  band_order      smallint not null check (band_order > 0),
  -- Annual thresholds. upper_bound null means "and above".
  lower_bound     numeric(14, 2) not null check (lower_bound >= 0),
  upper_bound     numeric(14, 2),
  rate_percent    numeric(6, 3) not null check (rate_percent >= 0 and rate_percent <= 100),
  effective_from  date not null,
  effective_to    date,
  created_at      timestamptz not null default now(),
  unique (organization_id, effective_from, band_order),
  constraint band_bounds_ordered check (upper_bound is null or upper_bound > lower_bound)
);

-- Per-employee earnings and deductions beyond basic salary.
create table salary_components (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  kind            salary_component_kind not null,
  name            text not null check (length(trim(name)) > 0),
  amount          numeric(14, 2) not null check (amount >= 0),
  currency_code   char(3) not null default 'NGN',
  -- Recurring components apply every period in their window; one-time
  -- components apply to a single period and are consumed by it.
  effective_from  date,
  effective_to    date,
  taxable         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index salary_components_employee_idx on salary_components (employee_id);

create trigger salary_components_updated_at
  before update on salary_components
  for each row execute function set_updated_at();

create table payroll_periods (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  label           text not null,
  starts_on       date not null,
  ends_on         date not null,
  pay_date        date,
  status          payroll_status not null default 'draft',
  currency_code   char(3) not null default 'NGN',

  -- Separation of duties, recorded rather than assumed.
  submitted_by    uuid references auth.users(id),
  submitted_at    timestamptz,
  approved_by     uuid references auth.users(id),
  approved_at     timestamptz,
  published_by    uuid references auth.users(id),
  published_at    timestamptz,
  closed_at       timestamptz,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique (organization_id, label),
  constraint period_dates_ordered check (ends_on >= starts_on),

  -- Accounts cannot approve its own run. Enforced here, not only in the UI:
  -- it is the whole point of a two-person pipeline.
  constraint approver_is_a_second_person
    check (approved_by is null or submitted_by is null or approved_by <> submitted_by)
);

create index payroll_periods_org_idx on payroll_periods (organization_id, starts_on desc);

create trigger payroll_periods_updated_at
  before update on payroll_periods
  for each row execute function set_updated_at();

-- One line per employee per run. Every figure is stored, not derived.
--
-- This is the snapshot that makes historical payroll stable: a raise in March
-- changes employee_compensation, and touches nothing here.
create table payroll_run_lines (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  payroll_period_id   uuid not null references payroll_periods(id) on delete cascade,
  employee_id         uuid not null references employees(id) on delete restrict,

  -- Denormalised on purpose. An employee who later leaves, changes department
  -- or is renamed must not alter a payslip already issued to them.
  employee_no         text not null,
  employee_name       text not null,
  department_name     text,

  basic_salary        numeric(14, 2) not null default 0 check (basic_salary >= 0),
  total_earnings      numeric(14, 2) not null default 0 check (total_earnings >= 0),
  gross_pay           numeric(14, 2) not null default 0 check (gross_pay >= 0),

  paye                numeric(14, 2) not null default 0 check (paye >= 0),
  pension_employee    numeric(14, 2) not null default 0 check (pension_employee >= 0),
  pension_employer    numeric(14, 2) not null default 0 check (pension_employer >= 0),
  nhf                 numeric(14, 2) not null default 0 check (nhf >= 0),
  other_deductions    numeric(14, 2) not null default 0 check (other_deductions >= 0),
  total_deductions    numeric(14, 2) not null default 0 check (total_deductions >= 0),

  net_pay             numeric(14, 2) not null default 0,
  currency_code       char(3) not null default 'NGN',

  -- The components that produced the figures above, kept so a payslip can be
  -- itemised years later without re-deriving anything.
  earning_lines       jsonb not null default '[]'::jsonb,
  deduction_lines     jsonb not null default '[]'::jsonb,

  created_at          timestamptz not null default now(),
  unique (payroll_period_id, employee_id),

  constraint net_is_gross_less_deductions
    check (net_pay = gross_pay - total_deductions)
);

create index payroll_run_lines_period_idx on payroll_run_lines (payroll_period_id);
create index payroll_run_lines_employee_idx on payroll_run_lines (employee_id);

-- Adjustments: an addition or subtraction on one run, with an author and a
-- reason. Corrections after publication become an adjustment on the NEXT
-- period, never an edit to this one.
create table payroll_adjustments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  payroll_period_id uuid not null references payroll_periods(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete restrict,
  label             text not null check (length(trim(label)) > 0),
  amount            numeric(14, 2) not null,
  reason            text not null check (length(trim(reason)) >= 10),
  created_by        uuid not null references auth.users(id),
  created_at        timestamptz not null default now(),
  constraint adjustment_is_not_zero check (amount <> 0)
);

create index payroll_adjustments_period_idx on payroll_adjustments (payroll_period_id);

create table payslips (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  payroll_run_line_id uuid not null references payroll_run_lines(id) on delete restrict,
  employee_id         uuid not null references employees(id) on delete restrict,
  published_at        timestamptz not null default now(),
  unique (payroll_run_line_id)
);

create index payslips_employee_idx on payslips (employee_id, published_at desc);


-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------

-- Run lines freeze at approval. Before that the run is being worked on and
-- recalculating is normal; after it, the figures are what two people signed.
create or replace function reject_locked_payroll_line()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status payroll_status;
begin
  select status into v_status from payroll_periods
  where id = coalesce(new.payroll_period_id, old.payroll_period_id);

  if v_status in ('approved', 'published', 'closed') then
    raise exception
      'This run is % — its figures are locked. A correction becomes an adjustment on the next period.',
      v_status
      using errcode = 'check_violation';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger payroll_run_lines_locked
  before insert or update or delete on payroll_run_lines
  for each row execute function reject_locked_payroll_line();

-- A payslip is a document that has been issued. It is never edited or
-- withdrawn.
create or replace function reject_payslip_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'A published payslip cannot be % — it has been issued',
    case tg_op when 'UPDATE' then 'changed' else 'withdrawn' end
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger payslips_immutable
  before update or delete on payslips
  for each row execute function reject_payslip_mutation();

revoke update, delete, truncate on payslips from public, anon, authenticated, service_role;
