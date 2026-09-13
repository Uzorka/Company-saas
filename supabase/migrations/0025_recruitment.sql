-- 0025_recruitment
--
-- Jobs, applications and the eight-stage pipeline. Source: Phase 6 -
-- Recruitment.
--
-- The design's framing: "candidate dignity treated as a requirement rather
-- than a nicety." Three things follow structurally:
--
--   * An applicant needs no account. They apply from the public site and are
--     a row here, not a user.
--   * Rejected and withdrawn candidates stay on the board and stay
--     searchable. Nothing is deleted.
--   * Conversion to an employee LINKS the application; it never consumes it.

create type job_status as enum ('draft', 'published', 'closed');

create type application_stage as enum (
  'applied', 'screening', 'shortlisted', 'interview',
  'offered', 'hired', 'rejected', 'withdrawn'
);

create table jobs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete cascade,
  title            text not null check (length(trim(title)) > 0),
  slug             text not null check (slug ~ '^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$'),
  department_id    uuid references departments(id) on delete set null,
  location         text,
  employment_type  employment_type not null default 'full_time',
  summary          text,
  description      text,
  responsibilities text,
  requirements     text,
  status           job_status not null default 'draft',
  closes_on        date,
  published_at     timestamptz,
  created_by       uuid references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (organization_id, slug)
);

create index jobs_public_idx on jobs (organization_id, status) where status = 'published';

create trigger jobs_updated_at
  before update on jobs
  for each row execute function set_updated_at();

create table job_applications (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  job_id          uuid not null references jobs(id) on delete restrict,

  -- The applicant. Deliberately not an auth user: someone applying for a job
  -- should not have to create an account with a company that has not hired
  -- them.
  first_name      text not null check (length(trim(first_name)) > 0),
  last_name       text not null check (length(trim(last_name)) > 0),
  email           text not null check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  phone           text,
  location        text,
  cover_letter    text,
  cv_path         text,
  source          text,

  stage           application_stage not null default 'applied',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One application per person per role. A second attempt updates the first
  -- rather than cluttering the pipeline with duplicates.
  unique (job_id, email)
);

create index job_applications_job_idx on job_applications (job_id, stage);
create index job_applications_org_idx on job_applications (organization_id, stage);

create trigger job_applications_updated_at
  before update on job_applications
  for each row execute function set_updated_at();

comment on table job_applications is
  'Applicants are not users. Rejected and withdrawn rows stay — the design '
  'keeps candidates searchable for 12 months and never deletes a history.';

-- Every stage move, kept.
create table application_stage_history (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references job_applications(id) on delete cascade,
  from_stage     application_stage,
  to_stage       application_stage not null,
  moved_by       uuid references auth.users(id),
  note           text,
  created_at     timestamptz not null default now()
);

create index application_stage_history_idx
  on application_stage_history (application_id, created_at);

create table application_notes (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references job_applications(id) on delete cascade,
  author_id      uuid not null references auth.users(id),
  body           text not null check (length(trim(body)) > 0),
  created_at     timestamptz not null default now()
);

create index application_notes_idx on application_notes (application_id, created_at);

-- Conversion. The application is linked, never consumed.
create table applicant_conversions (
  id             uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  application_id uuid not null references job_applications(id) on delete restrict,
  employee_id    uuid not null references employees(id) on delete restrict,
  converted_by   uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  -- Converting twice would create a second employee record for one person.
  unique (application_id)
);

comment on table applicant_conversions is
  'Links an application to the employee record it produced. The application '
  'is kept and remains searchable; the unique constraint makes a duplicate '
  'conversion impossible rather than merely discouraged.';
