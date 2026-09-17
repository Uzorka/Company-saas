-- ===========================================================================
-- The hiring pipeline: hold, interview, hire, and the emails each sends.
--
-- The recruitment board could display applicants and do nothing to them.
-- `application_stage_history` and `applicant_conversions` have existed since
-- 0025 with read policies and no insert policy at all, which is the right
-- shape — a stage move must not be forgeable — and left no way to move one.
-- These functions are that way.
--
-- WHY "ON HOLD" IS NOT A STAGE
--
-- It reads like one, and it is not. A candidate is held *at* screening or *at*
-- interview; the hold is orthogonal to where they are, and modelling it as a
-- stage would lose the position they were parked at.
--
-- There is also a hard practical reason. `install.sql` runs as one
-- transaction, and Postgres refuses to use a new enum value in the same
-- transaction that added it — "unsafe use of new value". Adding `on_hold` to
-- `application_stage` would make the whole installer fail the moment any
-- later statement in the bundle named the value. Measured, not assumed.
-- ===========================================================================

alter table job_applications
  add column if not exists on_hold_at        timestamptz,
  add column if not exists on_hold_reason    text,
  add column if not exists interview_at      timestamptz,
  add column if not exists interview_location text,
  add column if not exists interview_notes   text;

comment on column job_applications.on_hold_at is
  'Set while a candidate is parked. Orthogonal to stage: they stay where they '
  'were. Cleared by any stage move.';

create index if not exists job_applications_hold_idx
  on job_applications (organization_id) where on_hold_at is not null;


-- ---------------------------------------------------------------------------
-- Outbound email.
--
-- Every message the pipeline sends is written here first, then dispatched.
-- The row is the record; delivery is an attempt against it. That ordering is
-- deliberate: an email that was sent and not recorded is invisible to the
-- person who has to answer "what did we tell this candidate and when", and
-- that question is the entire reason a hiring trail exists.
--
-- It also means the product works with no email provider configured. Nothing
-- is silently dropped — the row sits at 'queued' and the screen says so.
-- ---------------------------------------------------------------------------
create table if not exists outbound_emails (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  application_id  uuid references job_applications(id) on delete set null,
  template        text not null,
  to_email        text not null check (to_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  to_name         text not null,
  subject         text not null check (length(trim(subject)) > 0),
  body            text not null check (length(trim(body)) > 0),
  status          text not null default 'queued'
                    check (status in ('queued', 'sent', 'failed')),
  provider_id     text,
  error           text,
  created_by      uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);

create index if not exists outbound_emails_org_idx
  on outbound_emails (organization_id, created_at desc);
create index if not exists outbound_emails_queued_idx
  on outbound_emails (organization_id) where status = 'queued';

comment on table outbound_emails is
  'Composed before it is sent, so the record survives a provider outage. No '
  'client may insert or update: rows are written by the pipeline functions '
  'and marked sent or failed by mark_email_sent / mark_email_failed.';

alter table outbound_emails enable row level security;
alter table outbound_emails force row level security;

create policy outbound_emails_read on outbound_emails
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

-- Deliberately no insert, update or delete policy. What the company told a
-- candidate is not something the company can quietly revise.

grant select on outbound_emails to authenticated;


-- ---------------------------------------------------------------------------
-- Composing an email.
--
-- The body is built in the database rather than in the application because
-- this is where the stage move happens: composing it anywhere else means a
-- move that succeeds and an email that never got written, with nothing tying
-- the two together.
--
-- Plain text, deliberately. A candidate reads it on a phone, it has to survive
-- every mail client, and an HTML template is a maintenance surface with no
-- benefit for four paragraphs.
-- ---------------------------------------------------------------------------
create or replace function queue_application_email(
  p_application_id uuid,
  p_template       text,
  p_subject        text,
  p_body           text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_app job_applications;
  v_id  uuid;
begin
  select * into v_app from job_applications
   where id = p_application_id and organization_id = current_org_id();
  if not found then
    raise exception 'That application does not exist' using errcode = 'no_data_found';
  end if;

  insert into outbound_emails
    (organization_id, application_id, template, to_email, to_name,
     subject, body, created_by)
  values
    (v_app.organization_id, v_app.id, p_template, v_app.email,
     v_app.first_name || ' ' || v_app.last_name, p_subject, p_body, auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function queue_application_email(uuid, text, text, text) from public;


/** Marks set by the sender once a provider has answered. */
create or replace function mark_email_sent(p_id uuid, p_provider_id text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update outbound_emails
     set status = 'sent', provider_id = p_provider_id, sent_at = now(), error = null
   where id = p_id
     and organization_id = current_org_id()
     and status = 'queued';
end;
$$;

create or replace function mark_email_failed(p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update outbound_emails
     set status = 'failed', error = left(coalesce(p_error, 'unknown'), 500)
   where id = p_id
     and organization_id = current_org_id()
     and status = 'queued';
end;
$$;

grant execute on function mark_email_sent(uuid, text) to authenticated;
grant execute on function mark_email_failed(uuid, text) to authenticated;




-- ---------------------------------------------------------------------------
-- Moving an applicant — replacing the 0026 version.
--
-- Three changes, no new signature:
--
--  1. Shortlisting queues an email. The candidate hears this one; a rejection
--     does not auto-send, because a company should choose what it says to
--     someone it turned down and a generated paragraph is the wrong default.
--  2. Any deliberate move clears an on-hold mark: a decision has been made.
--  3. The audit entry recorded `from` and `to` as the same value. The update
--     reassigned v_app before write_audit read v_app.stage from it, so every
--     stage change in the audit log has been claiming it came from where it
--     went. The old stage is captured before the update now.
-- ---------------------------------------------------------------------------
create or replace function move_application_stage(
  p_application_id uuid,
  p_to_stage       application_stage,
  p_note           text default null
)
returns job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_app      job_applications;
  v_from     application_stage;
  v_job      jobs;
  v_org_name text;
begin
  if not has_permission('recruitment.move_pipeline') then
    raise exception 'recruitment.move_pipeline is required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from job_applications
  where id = p_application_id and organization_id = v_org;
  if not found then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;

  if p_to_stage = 'hired' then
    raise exception
      'Marking someone hired happens through Convert to employee, so their record is created properly'
      using errcode = 'check_violation';
  end if;

  if v_app.stage = 'hired' then
    raise exception 'This applicant has already been hired'
      using errcode = 'check_violation';
  end if;

  -- Rejecting someone should say why, so the note is not optional there.
  if p_to_stage = 'rejected' and coalesce(length(trim(p_note)), 0) < 10 then
    raise exception 'Recording a rejection needs a brief reason'
      using errcode = 'check_violation';
  end if;

  -- Read before the update overwrites it.
  v_from := v_app.stage;

  insert into application_stage_history
    (organization_id, application_id, from_stage, to_stage, moved_by, note)
  values (v_org, p_application_id, v_from, p_to_stage, auth.uid(), p_note);

  update job_applications
     set stage = p_to_stage, on_hold_at = null, on_hold_reason = null
   where id = p_application_id returning * into v_app;

  if p_to_stage = 'shortlisted' then
    select * into v_job from jobs where id = v_app.job_id;
    select name into v_org_name from organizations where id = v_org;

    perform queue_application_email(
      v_app.id,
      'shortlisted',
      'You have been shortlisted — ' || coalesce(v_job.title, 'a role') ||
        ' at ' || v_org_name,
      'Dear ' || v_app.first_name || ' ' || v_app.last_name || E',\n\n' ||
      'Congratulations. Your application for ' ||
        coalesce(v_job.title, 'a role at our company') ||
        ' has been shortlisted.' || E'\n\n' ||
      'We were impressed by what you sent us and would like to take your '
        'application further. We will be in touch shortly to arrange the next '
        'step.' || E'\n\n' ||
      'Thank you for your interest in ' || v_org_name || '.' || E'\n\n' ||
      'Kind regards,' || E'\n' || v_org_name || E'\n' || 'Recruitment'
    );
  end if;

  perform write_audit('recruitment.stage', 'job_application', p_application_id::text,
    jsonb_build_object('from', v_from, 'to', p_to_stage, 'note', p_note));

  return v_app;
end;
$$;


-- ---------------------------------------------------------------------------
-- Holding a candidate.
--
-- The stage is untouched — they stay where the process actually left them, and
-- the hold is lifted by any deliberate move. No email: being parked is an
-- internal state, and telling a candidate they are on hold is a decision for a
-- person to make in their own words.
-- ---------------------------------------------------------------------------
create or replace function hold_application(
  p_application_id uuid,
  p_reason         text default null
)
returns job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org uuid := current_org_id();
  v_app job_applications;
begin
  if not has_permission('recruitment.move_pipeline') then
    raise exception 'recruitment.move_pipeline is required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from job_applications
  where id = p_application_id and organization_id = v_org;
  if not found then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;

  if v_app.stage in ('hired', 'rejected', 'withdrawn') then
    raise exception 'That application is closed and cannot be put on hold'
      using errcode = 'check_violation';
  end if;

  update job_applications
     set on_hold_at = now(),
         on_hold_reason = nullif(trim(coalesce(p_reason, '')), '')
   where id = p_application_id returning * into v_app;

  -- Recorded against the stage they are already at, so the trail reads in
  -- order rather than showing a gap where the hold happened.
  insert into application_stage_history
    (organization_id, application_id, from_stage, to_stage, moved_by, note)
  values (v_org, p_application_id, v_app.stage, v_app.stage, auth.uid(),
          'Put on hold' ||
          case when nullif(trim(coalesce(p_reason, '')), '') is not null
               then ': ' || p_reason else '' end);

  perform write_audit('recruitment.hold', 'job_application', p_application_id::text,
    jsonb_build_object('reason', p_reason, 'stage', v_app.stage));

  return v_app;
end;
$$;

grant execute on function hold_application(uuid, text) to authenticated;


-- ---------------------------------------------------------------------------
-- Scheduling an interview.
--
-- Stored as timestamptz and rendered in the organisation's own timezone when
-- the email is composed. A candidate reading "14:00" needs it to mean 14:00
-- where the interview is, not where the server happens to be.
-- ---------------------------------------------------------------------------
create or replace function schedule_application_interview(
  p_application_id uuid,
  p_at             timestamptz,
  p_location       text default null,
  p_note           text default null
)
returns job_applications
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org         uuid := current_org_id();
  v_app         job_applications;
  v_from        application_stage;
  v_job         jobs;
  v_org_name    text;
  v_tz          text;
  v_when        text;
  v_rescheduled boolean;
begin
  if not has_permission('recruitment.move_pipeline') then
    raise exception 'recruitment.move_pipeline is required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from job_applications
  where id = p_application_id and organization_id = v_org;
  if not found then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;

  if v_app.stage in ('hired', 'rejected', 'withdrawn') then
    raise exception 'That application is closed' using errcode = 'check_violation';
  end if;

  if p_at <= now() then
    raise exception 'An interview cannot be scheduled in the past'
      using errcode = 'check_violation';
  end if;

  v_from := v_app.stage;
  v_rescheduled := v_app.interview_at is not null;

  select name into v_org_name from organizations where id = v_org;
  select coalesce(timezone, 'Africa/Lagos') into v_tz
    from organization_settings where organization_id = v_org;
  v_tz := coalesce(v_tz, 'Africa/Lagos');

  v_when := to_char(p_at at time zone v_tz, 'FMDay FMDD FMMonth YYYY')
            || ' at ' || to_char(p_at at time zone v_tz, 'HH24:MI');

  insert into application_stage_history
    (organization_id, application_id, from_stage, to_stage, moved_by, note)
  values (v_org, p_application_id, v_from, 'interview', auth.uid(),
          case when v_rescheduled then 'Interview moved to ' else 'Interview set for ' end
          || v_when);

  update job_applications
     set stage = 'interview',
         interview_at = p_at,
         interview_location = nullif(trim(coalesce(p_location, '')), ''),
         interview_notes = nullif(trim(coalesce(p_note, '')), ''),
         on_hold_at = null,
         on_hold_reason = null
   where id = p_application_id returning * into v_app;

  select * into v_job from jobs where id = v_app.job_id;

  perform queue_application_email(
    v_app.id,
    case when v_rescheduled then 'interview_rescheduled' else 'interview' end,
    case when v_rescheduled then 'Your interview has moved — '
         else 'Interview invitation — ' end
      || coalesce(v_job.title, 'a role') || ' at ' || v_org_name,
    'Dear ' || v_app.first_name || ' ' || v_app.last_name || E',\n\n' ||
    case when v_rescheduled
         then 'Your interview for ' || coalesce(v_job.title, 'the role') ||
              ' has been moved. The new time is below.'
         else 'Congratulations. Following your application for ' ||
              coalesce(v_job.title, 'a role at our company') ||
              ', we would like to invite you to an interview.'
    end || E'\n\n' ||
    'Date and time: ' || v_when || ' (' || v_tz || ')' || E'\n' ||
    'Location: ' || coalesce(v_app.interview_location,
                             'we will confirm this separately') ||
    case when v_app.interview_notes is not null
         then E'\n\n' || v_app.interview_notes else '' end || E'\n\n' ||
    'Please reply to this message if that time does not work for you and we '
      'will find another.' || E'\n\n' ||
    'Kind regards,' || E'\n' || v_org_name || E'\n' || 'Recruitment'
  );

  perform write_audit('recruitment.interview', 'job_application',
    p_application_id::text,
    jsonb_build_object('at', p_at, 'location', p_location,
                       'rescheduled', v_rescheduled));

  return v_app;
end;
$$;

grant execute on function schedule_application_interview(uuid, timestamptz, text, text)
  to authenticated;


-- ---------------------------------------------------------------------------
-- Hiring — replacing the 0026 version.
--
-- Same behaviour, plus an employment type and the offer email. Dropped rather
-- than replaced because the signature gains a parameter, and an overload would
-- leave two functions where a call could resolve to either.
--
-- WHAT IT STILL DOES NOT DO, AND WHY
--
-- No sign-in account. An employee record and a login are separate things here;
-- the login is issued from Employees → Create account, where the generated
-- password is shown exactly once. Folding it in would put that one moment
-- inside the offer-letter step.
--
-- No salary. `employee_compensation` needs `payroll.manage_components`, which
-- HR deliberately does not hold — HR runs hiring and cannot see pay. So the
-- offer email names the role and start date and says terms follow separately,
-- which is also how a real offer usually arrives. Pay is set afterwards from
-- the employee's profile by someone who may.
-- ---------------------------------------------------------------------------
drop function if exists convert_applicant_to_employee(uuid, text, uuid, uuid, date);

create or replace function convert_applicant_to_employee(
  p_application_id  uuid,
  p_employee_no     text,
  p_department_id   uuid default null,
  p_position_id     uuid default null,
  p_hire_date       date default null,
  p_employment_type employment_type default 'full_time'
)
returns employees
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_app      job_applications;
  v_from     application_stage;
  v_employee employees;
  v_org_name text;
  v_position text;
  v_job      jobs;
  v_start    date;
begin
  if not has_permission('recruitment.convert_employee') then
    raise exception 'recruitment.convert_employee is required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_app from job_applications
  where id = p_application_id and organization_id = v_org;
  if not found then
    raise exception 'Application not found' using errcode = 'no_data_found';
  end if;

  if exists (select 1 from applicant_conversions where application_id = p_application_id) then
    raise exception 'This applicant has already been converted to an employee'
      using errcode = 'unique_violation';
  end if;

  if p_department_id is not null and not exists (
       select 1 from departments where id = p_department_id and organization_id = v_org) then
    raise exception 'That department is not part of this organization'
      using errcode = 'no_data_found';
  end if;

  if p_position_id is not null and not exists (
       select 1 from positions where id = p_position_id and organization_id = v_org) then
    raise exception 'That position is not part of this organization'
      using errcode = 'no_data_found';
  end if;

  v_from := v_app.stage;
  v_start := coalesce(p_hire_date, current_date);

  -- work_email stays null: a work address is issued by the company, not the
  -- personal one they applied from.
  insert into employees (
    organization_id, employee_no, first_name, last_name,
    work_email, phone, location, department_id, position_id,
    employment_type, hire_date
  )
  values (
    v_org, p_employee_no, v_app.first_name, v_app.last_name,
    null, v_app.phone, v_app.location, p_department_id, p_position_id,
    p_employment_type, v_start
  )
  returning * into v_employee;

  insert into applicant_conversions (organization_id, application_id, employee_id, converted_by)
  values (v_org, p_application_id, v_employee.id, auth.uid());

  insert into application_stage_history
    (organization_id, application_id, from_stage, to_stage, moved_by, note)
  values (v_org, p_application_id, v_from, 'hired', auth.uid(),
          'Converted to employee ' || p_employee_no);

  update job_applications
     set stage = 'hired', on_hold_at = null, on_hold_reason = null
   where id = p_application_id;

  select name into v_org_name from organizations where id = v_org;
  select title into v_position from positions where id = p_position_id;
  select * into v_job from jobs where id = v_app.job_id;

  perform queue_application_email(
    p_application_id,
    'offer',
    'Offer of employment — ' || coalesce(v_position, v_job.title, 'a role') ||
      ' at ' || v_org_name,
    'Dear ' || v_app.first_name || ' ' || v_app.last_name || E',\n\n' ||
    'Congratulations. Following your interview, we are delighted to offer you '
      'the position of ' || coalesce(v_position, v_job.title, 'the role') ||
      ' at ' || v_org_name || '.' || E'\n\n' ||
    'Start date: ' || to_char(v_start, 'FMDay FMDD FMMonth YYYY') || E'\n' ||
    'Employment type: ' || replace(p_employment_type::text, '_', ' ') || E'\n' ||
    'Employee number: ' || p_employee_no || E'\n\n' ||
    'Your remuneration, benefits and full terms will follow in a separate '
      'letter. This message confirms the offer itself and is not the '
      'contract.' || E'\n\n' ||
    'Please reply to confirm that you accept, and we will arrange your '
      'onboarding and first day.' || E'\n\n' ||
    'Welcome to ' || v_org_name || '.' || E'\n\n' ||
    'Kind regards,' || E'\n' || v_org_name || E'\n' || 'Recruitment'
  );

  perform write_audit('recruitment.convert', 'job_application', p_application_id::text,
    jsonb_build_object('employee_id', v_employee.id, 'employee_no', p_employee_no,
                       'application_kept', true));

  return v_employee;
end;
$$;

grant execute on function convert_applicant_to_employee(
  uuid, text, uuid, uuid, date, employment_type
) to authenticated;
