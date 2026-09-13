-- 0026_recruitment_actions
--
-- Applying, moving stages, and converting an applicant to an employee.

-- A public application.
--
-- Runs as the anonymous role, so it takes the organization from the job
-- rather than from a claim, and it accepts only published jobs. Without that
-- second check, a draft or closed role could be applied to by anyone who
-- guessed its id.
create or replace function apply_for_job(
  p_job_id       uuid,
  p_first_name   text,
  p_last_name    text,
  p_email        text,
  p_phone        text default null,
  p_location     text default null,
  p_cover_letter text default null,
  p_cv_path      text default null,
  p_source       text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job jobs;
  v_id  uuid;
begin
  select * into v_job from jobs where id = p_job_id and status = 'published';
  if not found then
    raise exception 'That role is not open for applications'
      using errcode = 'no_data_found';
  end if;

  if v_job.closes_on is not null and v_job.closes_on < current_date then
    raise exception 'Applications for that role have closed'
      using errcode = 'check_violation';
  end if;

  insert into job_applications (
    organization_id, job_id, first_name, last_name, email,
    phone, location, cover_letter, cv_path, source
  )
  values (
    v_job.organization_id, p_job_id, trim(p_first_name), trim(p_last_name),
    lower(trim(p_email)), p_phone, p_location, p_cover_letter, p_cv_path, p_source
  )
  on conflict (job_id, email) do update
    set first_name = excluded.first_name,
        last_name  = excluded.last_name,
        phone      = coalesce(excluded.phone, job_applications.phone),
        location   = coalesce(excluded.location, job_applications.location),
        cover_letter = coalesce(excluded.cover_letter, job_applications.cover_letter),
        cv_path    = coalesce(excluded.cv_path, job_applications.cv_path),
        updated_at = now()
  returning id into v_id;

  insert into application_stage_history (organization_id, application_id, to_stage, note)
  values (v_job.organization_id, v_id, 'applied', 'Applied through the careers site');

  return v_id;
end;
$$;

-- Move an applicant through the pipeline.
--
-- Hired is deliberately NOT reachable here. The design: "Dragging into Hired
-- opens the convert flow rather than silently moving." Hiring someone is the
-- creation of an employee record, not a status change.
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

  insert into application_stage_history
    (organization_id, application_id, from_stage, to_stage, moved_by, note)
  values (v_org, p_application_id, v_app.stage, p_to_stage, auth.uid(), p_note);

  update job_applications set stage = p_to_stage
  where id = p_application_id returning * into v_app;

  perform write_audit('recruitment.stage', 'job_application', p_application_id::text,
    jsonb_build_object('from', v_app.stage, 'to', p_to_stage, 'note', p_note));

  return v_app;
end;
$$;

-- Convert an applicant into an employee.
--
-- Creates the employee record and links it. The application is kept, its
-- stage becomes 'hired', and the unique constraint on applicant_conversions
-- makes a second conversion impossible.
create or replace function convert_applicant_to_employee(
  p_application_id uuid,
  p_employee_no    text,
  p_department_id  uuid default null,
  p_position_id    uuid default null,
  p_hire_date      date default null
)
returns employees
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_app      job_applications;
  v_employee employees;
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

  -- No auth account is created here. The employee record exists first; an
  -- invitation follows separately, which is what lets HR complete someone's
  -- employment details before they ever sign in.
  insert into employees (
    organization_id, employee_no, first_name, last_name,
    work_email, phone, location, department_id, position_id, hire_date
  )
  values (
    v_org, p_employee_no, v_app.first_name, v_app.last_name,
    null, v_app.phone, v_app.location, p_department_id, p_position_id,
    coalesce(p_hire_date, current_date)
  )
  returning * into v_employee;

  insert into applicant_conversions (organization_id, application_id, employee_id, converted_by)
  values (v_org, p_application_id, v_employee.id, auth.uid());

  insert into application_stage_history
    (organization_id, application_id, from_stage, to_stage, moved_by, note)
  values (v_org, p_application_id, v_app.stage, 'hired', auth.uid(),
          'Converted to employee ' || p_employee_no);

  update job_applications set stage = 'hired' where id = p_application_id;

  perform write_audit('recruitment.convert', 'job_application', p_application_id::text,
    jsonb_build_object('employee_id', v_employee.id, 'employee_no', p_employee_no,
                       'application_kept', true));

  return v_employee;
end;
$$;

grant execute on function apply_for_job(uuid, text, text, text, text, text, text, text, text)
  to anon, authenticated;
grant execute on function move_application_stage(uuid, application_stage, text) to authenticated;
grant execute on function convert_applicant_to_employee(uuid, text, uuid, uuid, date) to authenticated;
