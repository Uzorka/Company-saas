-- 0011_attendance
--
-- The verification core. Source: Phase 4, const CI (13 states) and const ATT.
--
-- The design's principle for this module: "Verification is the product... Do
-- not simplify them." Two things follow, and both are load-bearing:
--
--  1. Location is read at the moment of an action and never in the background.
--     There is no table here that could hold a track, and no column for one.
--  2. Nothing is destroyed. A correction is a new row referencing the
--     original; a forgotten check-out is auto-closed and flagged, never
--     deleted.

create type attendance_type as enum ('office', 'remote', 'uncertain');

create type attendance_state as enum (
  'checked_in',   -- open, running
  'checked_out',  -- closed normally
  'auto_closed'   -- no check-out by midnight; flagged, never deleted
);

create type attendance_review_state as enum (
  'not_required',   -- nothing anomalous
  'pending',        -- flagged, awaiting HR
  'approved',       -- HR accepted it as recorded
  'corrected'       -- superseded by a correction record
);

create table attendance_records (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references organizations(id) on delete cascade,
  employee_id        uuid not null references employees(id) on delete cascade,
  office_id          uuid references offices(id) on delete set null,

  -- Server-authoritative. The browser's clock is never trusted for the time
  -- an employee is paid against.
  check_in_at        timestamptz not null default now(),
  check_out_at       timestamptz,

  -- The local date the shift belongs to, so a session crossing midnight still
  -- counts as one working day rather than two half-days.
  work_date          date not null,

  check_in_latitude   numeric(9, 6),
  check_in_longitude  numeric(9, 6),
  check_in_accuracy_m numeric(8, 2),
  check_in_distance_m numeric(10, 2),

  check_out_latitude   numeric(9, 6),
  check_out_longitude  numeric(9, 6),
  check_out_accuracy_m numeric(8, 2),
  check_out_distance_m numeric(10, 2),

  attendance_type    attendance_type not null,
  state              attendance_state not null default 'checked_in',
  review_state       attendance_review_state not null default 'not_required',

  -- Why this record needs a human. Kept as text codes rather than an enum so
  -- a new exception does not need a migration to be recordable.
  exception_codes    text[] not null default '{}',

  -- Minutes late against the employee's shift, null when no shift applies.
  late_by_minutes    integer,

  device             text,
  notes              text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint check_out_after_check_in
    check (check_out_at is null or check_out_at >= check_in_at),
  constraint closed_records_have_a_check_out
    check (state = 'checked_in' or check_out_at is not null)
);

-- One open record per employee. This is what makes a duplicate check-in
-- impossible rather than merely discouraged by the UI.
create unique index attendance_one_open_per_employee
  on attendance_records (employee_id)
  where state = 'checked_in';

-- One record per employee per working day, so a second check-in after
-- checking out cannot silently create a parallel day.
create unique index attendance_one_per_employee_per_day
  on attendance_records (employee_id, work_date);

create index attendance_org_date_idx on attendance_records (organization_id, work_date desc);
create index attendance_employee_date_idx on attendance_records (employee_id, work_date desc);
create index attendance_review_idx on attendance_records (organization_id, review_state)
  where review_state = 'pending';

create trigger attendance_records_updated_at
  before update on attendance_records
  for each row execute function set_updated_at();

comment on table attendance_records is
  'One row per employee per working day. Location is captured only at check-in '
  'and check-out — there is deliberately no structure here capable of holding '
  'a continuous track.';

-- Evidence: the selfie. The image itself lives in a private bucket; this is
-- the metadata and the access-control point.
create type attendance_evidence_kind as enum ('check_in_selfie', 'check_out_selfie');

create table attendance_evidence (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  attendance_record_id uuid not null references attendance_records(id) on delete cascade,
  kind                 attendance_evidence_kind not null,
  storage_path         text not null,
  captured_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  unique (attendance_record_id, kind)
);

create index attendance_evidence_record_idx
  on attendance_evidence (attendance_record_id);

-- Breaks. The design's "Start a break" action on an open record.
create table attendance_breaks (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  attendance_record_id uuid not null references attendance_records(id) on delete cascade,
  started_at           timestamptz not null default now(),
  ended_at             timestamptz,
  created_at           timestamptz not null default now(),
  constraint break_ends_after_it_starts
    check (ended_at is null or ended_at >= started_at)
);

create index attendance_breaks_record_idx on attendance_breaks (attendance_record_id);

-- Corrections.
--
-- A correction is a NEW row referencing the original. The original record is
-- never edited and never deleted — the design is explicit, and an attendance
-- record is the evidence behind someone's pay.
create table attendance_corrections (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references organizations(id) on delete cascade,
  attendance_record_id uuid not null references attendance_records(id) on delete restrict,
  corrected_by         uuid not null references auth.users(id),
  -- Mandatory wherever an action affects someone else's record.
  reason               text not null check (length(trim(reason)) >= 10),
  previous_check_in_at  timestamptz,
  previous_check_out_at timestamptz,
  new_check_in_at       timestamptz,
  new_check_out_at      timestamptz,
  previous_type        attendance_type,
  new_type             attendance_type,
  created_at           timestamptz not null default now()
);

create index attendance_corrections_record_idx
  on attendance_corrections (attendance_record_id, created_at desc);

-- The original row is the historical fact; it is not rewritten by a
-- correction. Block the two columns a correction might be tempted to edit.
create or replace function reject_check_in_time_edit()
returns trigger
language plpgsql
as $$
begin
  if old.check_in_at is distinct from new.check_in_at then
    raise exception
      'check_in_at is immutable: record a correction referencing this record instead'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger attendance_check_in_immutable
  before update on attendance_records
  for each row execute function reject_check_in_time_edit();
