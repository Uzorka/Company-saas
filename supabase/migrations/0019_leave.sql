-- 0019_leave
--
-- Leave, with a two-stage approval chain. Source: Phase 5 - Leave, and the
-- leave types in Phase 7 settings.
--
-- The chain is Employee -> HOD -> HR -> Approved, and it collapses to
-- Employee -> HR when the requester has no head of department. Two stages
-- exist because they ask different questions: the HOD judges coverage, HR
-- judges policy. Collapsing them into one approval loses that.
--
-- The rule that most needs to hold: **a balance moves only on final
-- approval.** Deducting at submission would make a declined request cost the
-- employee days, and deducting at HOD approval would strand days in limbo if
-- HR declines.

create type leave_status as enum (
  'draft',
  'pending_hod',
  'pending_hr',
  'approved',
  'declined',
  'cancelled'
);

create type leave_stage as enum ('hod', 'hr');
create type approval_decision as enum ('approved', 'declined');

create table leave_types (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations(id) on delete cascade,
  name                text not null check (length(trim(name)) > 0),
  description         text,
  -- Null means uncapped, as unpaid leave is. Zero would mean "none allowed",
  -- which is a different thing and would silently block every request.
  annual_entitlement_days numeric(5, 2) check (annual_entitlement_days is null or annual_entitlement_days >= 0),
  accrual_days_per_month  numeric(5, 3) check (accrual_days_per_month is null or accrual_days_per_month >= 0),
  -- Sick leave over this many consecutive days needs a certificate. Null
  -- means no document is ever required.
  document_required_after_days smallint check (document_required_after_days is null or document_required_after_days > 0),
  paid                boolean not null default true,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (organization_id, name)
);

create trigger leave_types_updated_at
  before update on leave_types
  for each row execute function set_updated_at();

-- One row per employee per type per leave year.
create table leave_balances (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  leave_type_id   uuid not null references leave_types(id) on delete cascade,
  leave_year      smallint not null,
  entitled_days   numeric(5, 2) not null default 0 check (entitled_days >= 0),
  taken_days      numeric(5, 2) not null default 0 check (taken_days >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (employee_id, leave_type_id, leave_year)
);

create index leave_balances_employee_idx on leave_balances (employee_id, leave_year);

create trigger leave_balances_updated_at
  before update on leave_balances
  for each row execute function set_updated_at();

create table leave_requests (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  employee_id      uuid not null references employees(id) on delete cascade,
  leave_type_id    uuid not null references leave_types(id) on delete restrict,
  status           leave_status not null default 'draft',
  starts_on        date not null,
  ends_on          date not null,
  -- Stored rather than derived: a later change to the working calendar must
  -- not retroactively alter what an approved request cost.
  days_requested   numeric(5, 2) not null check (days_requested > 0),
  reason           text,
  document_path    text,
  submitted_at     timestamptz,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint ends_on_after_starts_on check (ends_on >= starts_on)
);

create index leave_requests_employee_idx on leave_requests (employee_id, starts_on desc);
create index leave_requests_pending_idx on leave_requests (organization_id, status)
  where status in ('pending_hod', 'pending_hr');

create trigger leave_requests_updated_at
  before update on leave_requests
  for each row execute function set_updated_at();

-- Every decision, kept. A declined request keeps its reason and an approved
-- one keeps who signed it off — the design's approval timeline is rendered
-- from this table, not reconstructed.
create table leave_approvals (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  leave_request_id uuid not null references leave_requests(id) on delete cascade,
  stage            leave_stage not null,
  decision         approval_decision not null,
  approver_id      uuid not null references auth.users(id),
  note             text,
  decided_at       timestamptz not null default now(),
  -- A declined stage must say why. An approval may add a note or not.
  constraint declines_state_a_reason
    check (decision <> 'declined' or (note is not null and length(trim(note)) >= 10))
);

create index leave_approvals_request_idx on leave_approvals (leave_request_id, decided_at);

comment on table leave_approvals is
  'Append-only decision history. A cancellation after approval is a new '
  'request, never an edit — so this table is the record of what was agreed.';
