-- 0008_departments_positions
--
-- Department structure. Source: Phase 4 - Employees, Departments, Attendance.
--
-- An HOD may head more than one department, so headship is its own table
-- rather than a column on departments. That relationship is load-bearing:
-- every "Dept only" scope in the permission matrix resolves through it.

create table departments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  code            text not null check (code ~ '^[A-Z0-9-]{2,16}$'),
  name            text not null check (length(trim(name)) > 0),
  description     text,
  parent_id       uuid references departments(id) on delete set null,
  -- Deactivated, never deleted: attendance, tasks and payroll all reference
  -- departments historically.
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, code)
);

create index departments_org_idx on departments (organization_id);

create trigger departments_updated_at
  before update on departments
  for each row execute function set_updated_at();

create table positions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  department_id   uuid references departments(id) on delete set null,
  title           text not null check (length(trim(title)) > 0),
  grade           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, department_id, title)
);

create index positions_org_idx on positions (organization_id);

create trigger positions_updated_at
  before update on positions
  for each row execute function set_updated_at();

-- Headship. One department may have several heads over time, and one person
-- may head several departments — hence a table, not a column.
--
-- `user_id` rather than an employee id: the scope has to resolve from a JWT,
-- and not every head necessarily has an employee record yet.
create table department_heads (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  department_id   uuid not null references departments(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  assigned_at     timestamptz not null default now(),
  unique (department_id, user_id)
);

create index department_heads_user_idx on department_heads (user_id, organization_id);

-- Which departments does the caller head?
--
-- This is the SQL behind the matrix's "Dept only" scope. It is `stable` and
-- indexed on (user_id, organization_id) because it runs inside policies that
-- may be evaluated per row.
create or replace function headed_department_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select dh.department_id
  from department_heads dh
  where dh.user_id = auth.uid()
    and dh.organization_id = current_org_id();
$$;

create or replace function heads_department(target_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select target_department_id is not null
     and target_department_id in (select headed_department_ids());
$$;
