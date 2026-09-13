-- 0020_leave_actions
--
-- The leave workflow.
--
-- Three things are decided here rather than in the application, because each
-- of them costs an employee real days if it goes wrong:
--
--   1. A balance moves ONLY on final approval.
--   2. Insufficient balance blocks submission, with the shortfall stated.
--   3. The chain routes to HR directly when the requester has no HOD.

-- Working days between two dates, weekends excluded.
--
-- Public holidays are not modelled yet — that needs the client's calendar,
-- and guessing Nigerian holidays would silently miscount leave. Flagged in
-- BACKLOG; the count is stored on the request so adding a holiday table later
-- cannot retroactively change an approved request.
create or replace function working_days_between(starts_on date, ends_on date)
returns numeric
language sql
immutable
as $$
  select count(*)::numeric
  from generate_series(starts_on, ends_on, interval '1 day') as d
  where extract(isodow from d) < 6;
$$;

-- Days left, for a type and year.
create or replace function leave_days_remaining(
  p_employee_id   uuid,
  p_leave_type_id uuid,
  p_year          smallint
)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select b.entitled_days - b.taken_days
     from leave_balances b
     where b.employee_id = p_employee_id
       and b.leave_type_id = p_leave_type_id
       and b.leave_year = p_year),
    0
  );
$$;

-- Who approves first? The requester's HOD, if they have one.
create or replace function first_leave_stage(p_employee_id uuid)
returns leave_status
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when exists (
      select 1
      from employees e
      join department_heads dh on dh.department_id = e.department_id
      where e.id = p_employee_id
        -- A head does not approve their own leave; that would make the two
        -- stages one. Their request goes straight to HR.
        and dh.user_id is distinct from e.user_id
    )
    then 'pending_hod'::leave_status
    else 'pending_hr'::leave_status
  end;
$$;

comment on function first_leave_stage is
  'Routes to the HOD when the requester has one other than themselves, and '
  'straight to HR otherwise. A department head''s own leave skips the stage '
  'they would be signing.';

create or replace function submit_leave_request(
  p_leave_type_id uuid,
  p_starts_on     date,
  p_ends_on       date,
  p_reason        text default null,
  p_document_path text default null
)
returns leave_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org       uuid := current_org_id();
  v_employee  uuid := my_employee_id();
  v_type      leave_types;
  v_days      numeric;
  v_remaining numeric;
  v_year      smallint := extract(year from p_starts_on)::smallint;
  v_request   leave_requests;
begin
  if v_org is null or v_employee is null then
    raise exception 'No employee record for this account in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  if not has_permission('leave.request') then
    raise exception 'leave.request is required' using errcode = 'insufficient_privilege';
  end if;

  if p_ends_on < p_starts_on then
    raise exception 'Leave cannot end before it starts' using errcode = 'check_violation';
  end if;

  select * into v_type from leave_types
  where id = p_leave_type_id and organization_id = v_org and active;
  if not found then
    raise exception 'That leave type is not available' using errcode = 'no_data_found';
  end if;

  v_days := working_days_between(p_starts_on, p_ends_on);
  if v_days <= 0 then
    raise exception 'That range contains no working days'
      using errcode = 'check_violation';
  end if;

  -- Document requirement, e.g. sick leave over three consecutive days.
  if v_type.document_required_after_days is not null
     and v_days > v_type.document_required_after_days
     and coalesce(length(trim(p_document_path)), 0) = 0 then
    raise exception
      '% over % days needs a supporting document',
      v_type.name, v_type.document_required_after_days
      using errcode = 'check_violation';
  end if;

  -- Insufficient balance blocks submission, and states the shortfall — the
  -- design is explicit that the employee should learn this before submitting,
  -- not be declined for it a week later. Uncapped types skip the check.
  if v_type.annual_entitlement_days is not null then
    v_remaining := leave_days_remaining(v_employee, p_leave_type_id, v_year);
    if v_days > v_remaining then
      raise exception
        'You have % days of % left and this request is % days — short by %',
        v_remaining, v_type.name, v_days, v_days - v_remaining
        using errcode = 'check_violation';
    end if;
  end if;

  insert into leave_requests (
    organization_id, employee_id, leave_type_id, status,
    starts_on, ends_on, days_requested, reason, document_path, submitted_at
  )
  values (
    v_org, v_employee, p_leave_type_id, first_leave_stage(v_employee),
    p_starts_on, p_ends_on, v_days, p_reason, p_document_path, now()
  )
  returning * into v_request;

  perform write_audit('leave.submit', 'leave_request', v_request.id::text,
    jsonb_build_object('type', v_type.name, 'days', v_days,
                       'routed_to', v_request.status));

  return v_request;
end;
$$;

-- Approve or decline one stage.
create or replace function decide_leave_request(
  p_request_id uuid,
  p_approve    boolean,
  p_note       text default null
)
returns leave_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_request  leave_requests;
  v_stage    leave_stage;
  v_year     smallint;
begin
  select * into v_request from leave_requests
  where id = p_request_id and organization_id = v_org;

  if not found then
    raise exception 'Request not found' using errcode = 'no_data_found';
  end if;

  -- Which stage is this, and may the caller decide it?
  if v_request.status = 'pending_hod' then
    v_stage := 'hod';
    if not has_permission('leave.approve_department') then
      raise exception 'This request is waiting on a head of department'
        using errcode = 'insufficient_privilege';
    end if;
    if not exists (
      select 1 from employees e
      where e.id = v_request.employee_id
        and e.department_id in (select headed_department_ids())
    ) then
      raise exception 'You do not head this employee''s department'
        using errcode = 'insufficient_privilege';
    end if;
  elsif v_request.status = 'pending_hr' then
    v_stage := 'hr';
    if not has_permission('leave.approve_hr') then
      raise exception 'This request is waiting on HR'
        using errcode = 'insufficient_privilege';
    end if;
  else
    raise exception 'This request is already %', v_request.status
      using errcode = 'check_violation';
  end if;

  -- Nobody signs off their own leave, whatever permissions they hold.
  if exists (
    select 1 from employees e
    where e.id = v_request.employee_id and e.user_id = auth.uid()
  ) then
    raise exception 'You cannot decide your own leave request'
      using errcode = 'insufficient_privilege';
  end if;

  if not p_approve and coalesce(length(trim(p_note)), 0) < 10 then
    raise exception 'Declining a request needs a reason the employee can read'
      using errcode = 'check_violation';
  end if;

  insert into leave_approvals (organization_id, leave_request_id, stage,
                               decision, approver_id, note)
  values (v_org, p_request_id, v_stage,
          (case when p_approve then 'approved' else 'declined' end)::approval_decision,
          auth.uid(), p_note);

  if not p_approve then
    update leave_requests
    set status = 'declined', decided_at = now()
    where id = p_request_id
    returning * into v_request;

  elsif v_stage = 'hod' then
    -- HOD approval advances the request; it does not grant the leave, and it
    -- deliberately does not touch the balance.
    update leave_requests
    set status = 'pending_hr'
    where id = p_request_id
    returning * into v_request;

  else
    -- Final approval. This is the only place a balance moves.
    update leave_requests
    set status = 'approved', decided_at = now()
    where id = p_request_id
    returning * into v_request;

    v_year := extract(year from v_request.starts_on)::smallint;

    insert into leave_balances (organization_id, employee_id, leave_type_id,
                                leave_year, entitled_days, taken_days)
    values (v_org, v_request.employee_id, v_request.leave_type_id, v_year,
            0, v_request.days_requested)
    on conflict (employee_id, leave_type_id, leave_year)
    do update set taken_days = leave_balances.taken_days + excluded.taken_days;
  end if;

  perform write_audit(
    'leave.' || v_stage::text || '.' || (case when p_approve then 'approve' else 'decline' end),
    'leave_request', p_request_id::text,
    jsonb_build_object('note', p_note, 'status', v_request.status,
                       'days', v_request.days_requested));

  return v_request;
end;
$$;

-- An employee may withdraw their own request while it is still pending.
-- After approval it is a new request, not an edit — the design is explicit.
create or replace function cancel_leave_request(p_request_id uuid)
returns leave_requests
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request leave_requests;
begin
  select * into v_request from leave_requests
  where id = p_request_id
    and organization_id = current_org_id()
    and employee_id = my_employee_id();

  if not found then
    raise exception 'Not your request' using errcode = 'insufficient_privilege';
  end if;

  if v_request.status not in ('draft', 'pending_hod', 'pending_hr') then
    raise exception
      'A % request cannot be cancelled — submit a new request instead',
      v_request.status
      using errcode = 'check_violation';
  end if;

  update leave_requests set status = 'cancelled', decided_at = now()
  where id = p_request_id returning * into v_request;

  perform write_audit('leave.cancel', 'leave_request', p_request_id::text, '{}'::jsonb);
  return v_request;
end;
$$;

grant execute on function submit_leave_request(uuid, date, date, text, text) to authenticated;
grant execute on function decide_leave_request(uuid, boolean, text) to authenticated;
grant execute on function cancel_leave_request(uuid) to authenticated;
grant execute on function leave_days_remaining(uuid, uuid, smallint) to authenticated;
