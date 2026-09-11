-- 0009_employees
--
-- The people record everything else references.
--
-- Two structural decisions carry the design's requirements:
--
--  1. Compensation lives in its own table, effective-dated. A role without
--     payroll access is then denied at the TABLE level, so salary is absent
--     from the response rather than hidden in the UI — and a historical rate
--     survives a later raise, which published payslips depend on.
--
--  2. `user_id` is nullable. An employee record can exist before an account
--     is invited, and an applicant converted to an employee has a record
--     before they ever sign in.

create type employment_status as enum ('active', 'probation', 'leave', 'suspended', 'exited');
create type employment_type as enum ('full_time', 'part_time', 'contract', 'intern', 'nysc');

create table employees (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  -- Null until an account is invited. An applicant becomes an employee record
  -- first; the account follows.
  user_id           uuid references auth.users(id) on delete set null,
  employee_no       text not null check (employee_no ~ '^[A-Z]{2,5}-[0-9]{3,6}$'),
  first_name        text not null check (length(trim(first_name)) > 0),
  last_name         text not null check (length(trim(last_name)) > 0),
  photo_url         text,
  work_email        text check (work_email is null or work_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone             text,
  location          text,
  department_id     uuid references departments(id) on delete set null,
  position_id       uuid references positions(id) on delete set null,
  manager_id        uuid references employees(id) on delete set null,
  employment_type   employment_type not null default 'full_time',
  employment_status employment_status not null default 'active',
  hire_date         date not null,
  exit_date         date,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, employee_no),
  unique (organization_id, user_id),
  constraint exit_date_after_hire check (exit_date is null or exit_date >= hire_date),
  constraint exited_has_exit_date check (employment_status <> 'exited' or exit_date is not null)
);

create index employees_org_idx on employees (organization_id);
create index employees_department_idx on employees (organization_id, department_id);
create index employees_user_idx on employees (user_id);
create index employees_name_idx on employees (organization_id, last_name, first_name);

create trigger employees_updated_at
  before update on employees
  for each row execute function set_updated_at();

comment on column employees.user_id is
  'Null until an account is invited. Employment and identity are separate: an '
  'applicant becomes an employee record before they ever sign in.';

-- Emergency contacts. Deliberately minimal — the design warns against
-- collecting personal information the product has no use for.
create table employee_emergency_contacts (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references employees(id) on delete cascade,
  name         text not null check (length(trim(name)) > 0),
  relationship text,
  phone        text not null check (length(trim(phone)) > 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index employee_emergency_contacts_employee_idx
  on employee_emergency_contacts (employee_id);

create trigger employee_emergency_contacts_updated_at
  before update on employee_emergency_contacts
  for each row execute function set_updated_at();

-- Compensation, effective-dated.
--
-- Separate table so payroll access is enforced by table privileges. Money is
-- numeric with a stored currency; a later raise creates a new row rather than
-- editing the old one, so a published payslip never changes retroactively.
create table employee_compensation (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  basic_salary    numeric(14, 2) not null check (basic_salary >= 0),
  currency_code   char(3) not null default 'NGN',
  effective_from  date not null,
  effective_to    date,
  reason          text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  constraint compensation_period_valid
    check (effective_to is null or effective_to > effective_from)
);

create index employee_compensation_employee_idx
  on employee_compensation (employee_id, effective_from desc);

comment on table employee_compensation is
  'Effective-dated. A change is a new row, never an edit, so historical '
  'payroll stays reproducible. Separate from employees so a role without '
  'payroll access is denied at table level and salary is absent from the '
  'response rather than hidden in the UI.';

-- Employee documents. The file itself lives in private storage; this is the
-- metadata and the access control point.
create table employee_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  employee_id     uuid not null references employees(id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  category        text,
  storage_path    text not null,
  mime_type       text,
  size_bytes      bigint check (size_bytes is null or size_bytes >= 0),
  expires_on      date,
  uploaded_by     uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

create index employee_documents_employee_idx on employee_documents (employee_id);

-- Shift patterns.
--
-- Required by the design but never given a screen: "Late" and "Absent" are
-- computed against an expected start, and Phase 4 shows a 09:00 sales shift
-- alongside an 08:00 warehouse shift. Flagged in docs/BACKLOG.md as needing a
-- design pass; built as data now so attendance in Phase 4 has something real
-- to compare against instead of a hardcoded time.
create table shift_patterns (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  starts_at        time not null,
  ends_at          time not null,
  -- ISO-8601 weekday numbers, Monday = 1. Kept explicit rather than a bitmask
  -- so a query for "who is expected today" stays readable.
  workdays         smallint[] not null default '{1,2,3,4,5}',
  grace_minutes    smallint not null default 0 check (grace_minutes between 0 and 240),
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, name),
  constraint workdays_are_valid check (
    workdays <@ '{1,2,3,4,5,6,7}'::smallint[] and array_length(workdays, 1) > 0
  )
);

create trigger shift_patterns_updated_at
  before update on shift_patterns
  for each row execute function set_updated_at();

create table employee_shifts (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  employee_id      uuid not null references employees(id) on delete cascade,
  shift_pattern_id uuid not null references shift_patterns(id) on delete restrict,
  effective_from   date not null,
  effective_to     date,
  created_at       timestamptz not null default now(),
  constraint shift_period_valid
    check (effective_to is null or effective_to > effective_from)
);

create index employee_shifts_employee_idx
  on employee_shifts (employee_id, effective_from desc);

-- The employee row belonging to the caller, if any. Used by every
-- `view_self` scope, so it is defined once here.
create or replace function my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select e.id
  from employees e
  where e.user_id = auth.uid()
    and e.organization_id = current_org_id()
  limit 1;
$$;
