-- 0016_tasks
--
-- Tasks and field-visit verification. Source: Phase 5 - Tasks, Field Visits,
-- Leave.
--
-- The design's central rule for this module: proof is required only where it
-- is meaningful. "Do not force field verification on every task" — desk work
-- is trust-based, a store visit is not. Five verification modes, chosen per
-- task, rather than one policy for everything.

create type task_status as enum ('todo', 'in_progress', 'review', 'completed', 'cancelled');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');

-- Source: const VER in Phase 5.
create type verification_mode as enum (
  'none',                  -- marked done by the assignee; desk work
  'photo',                 -- one photo at the moment of completion
  'location',              -- a single position reading when the task closes
  'photo_location',        -- both, captured together at the site
  'photo_location_report'  -- both plus a written report; audits, stock counts
);

create table tasks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  reference         text not null,
  title             text not null check (length(trim(title)) > 0),
  description       text,
  department_id     uuid references departments(id) on delete set null,
  created_by        uuid not null references auth.users(id),
  priority          task_priority not null default 'medium',
  status            task_status not null default 'todo',
  verification_mode verification_mode not null default 'none',
  start_date        date,
  due_date          date,
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, reference),
  constraint due_after_start check (due_date is null or start_date is null or due_date >= start_date)
);

create index tasks_org_status_idx on tasks (organization_id, status);
create index tasks_department_idx on tasks (organization_id, department_id);
create index tasks_due_idx on tasks (organization_id, due_date) where status <> 'completed';

create trigger tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- Multiple assignees, per the brief. A task with two people is one task.
create table task_assignees (
  task_id     uuid not null references tasks(id) on delete cascade,
  employee_id uuid not null references employees(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, employee_id)
);

create index task_assignees_employee_idx on task_assignees (employee_id);

-- Where a field task is supposed to happen.
--
-- allowed_radius_m is per-task rather than per-organization: a supermarket
-- forecourt and a small kiosk do not deserve the same tolerance.
create table task_target_locations (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  task_id          uuid not null references tasks(id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  address          text,
  latitude         numeric(9, 6) not null check (latitude between -90 and 90),
  longitude        numeric(9, 6) not null check (longitude between -180 and 180),
  allowed_radius_m integer not null default 150 check (allowed_radius_m between 1 and 5000),
  contact_person   text,
  instructions     text,
  created_at       timestamptz not null default now(),
  unique (task_id)
);

create table task_comments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id         uuid not null references tasks(id) on delete cascade,
  author_id       uuid not null references auth.users(id),
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now()
);

create index task_comments_task_idx on task_comments (task_id, created_at);

create table task_attachments (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id         uuid not null references tasks(id) on delete cascade,
  name            text not null,
  storage_path    text not null,
  mime_type       text,
  size_bytes      bigint check (size_bytes is null or size_bytes >= 0),
  uploaded_by     uuid references auth.users(id),
  created_at      timestamptz not null default now()
);

-- Activity. Append-only like the audit log, but scoped to one task and
-- readable by anyone who can see it — the audit log is for Management, this is
-- for the people doing the work.
create table task_activity (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id         uuid not null references tasks(id) on delete cascade,
  actor_id        uuid references auth.users(id) on delete set null,
  action          text not null,
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

create index task_activity_task_idx on task_activity (task_id, created_at desc);


-- ---------------------------------------------------------------------------
-- Field visits
--
-- Source: Phase 5, const FV — thirteen states, and const FV_NEXT.
--
-- Two design rules are enforced structurally rather than by the UI:
--
--   * "Out of range blocks capture." Range is checked before the camera
--     opens, so a submitted visit is one that was in range or explicitly
--     flagged — never a silent mismatch.
--   * "A returned visit keeps the original alongside the reason." A return is
--     a new state on the same row plus a reason, and the evidence stays.
-- ---------------------------------------------------------------------------
create type field_visit_state as enum (
  'assigned',
  'submitted',
  'verified',
  'returned',
  'flagged'      -- submitted but something is off; a person decides
);

create table field_visits (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references organizations(id) on delete cascade,
  task_id           uuid not null references tasks(id) on delete cascade,
  employee_id       uuid not null references employees(id) on delete cascade,

  state             field_visit_state not null default 'assigned',

  -- Captured at submission, server-side.
  submitted_at      timestamptz,
  latitude          numeric(9, 6),
  longitude         numeric(9, 6),
  accuracy_m        numeric(8, 2),
  distance_m        numeric(10, 2),

  report            text,
  outcome           text,
  exception_codes   text[] not null default '{}',

  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  -- Mandatory on return: the assignee has to know what to do differently.
  review_reason     text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint returned_visits_state_a_reason
    check (state <> 'returned' or (review_reason is not null and length(trim(review_reason)) >= 10)),
  constraint reviewed_visits_have_a_reviewer
    check (state not in ('verified', 'returned') or reviewed_by is not null)
);

create index field_visits_task_idx on field_visits (task_id);
create index field_visits_employee_idx on field_visits (employee_id);
create index field_visits_review_idx on field_visits (organization_id, state)
  where state in ('submitted', 'flagged');

create trigger field_visits_updated_at
  before update on field_visits
  for each row execute function set_updated_at();

create table field_visit_evidence (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  field_visit_id   uuid not null references field_visits(id) on delete cascade,
  storage_path     text not null,
  captured_at      timestamptz not null default now(),
  -- A re-capture after a return adds evidence rather than replacing it, so
  -- the reviewer can see both. Nothing is destroyed.
  attempt          integer not null default 1 check (attempt >= 1),
  created_at       timestamptz not null default now(),
  unique (field_visit_id, attempt)
);

-- Human-readable task references: TSK-2041, per the design.
create sequence if not exists task_reference_seq start 1000;

create or replace function next_task_reference()
returns text
language sql
volatile
as $$
  select 'TSK-' || nextval('task_reference_seq')::text;
$$;
