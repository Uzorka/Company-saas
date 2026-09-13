-- 0018_field_visit_actions
--
-- Submitting and reviewing a field visit.
--
-- Same shape as check_in(): the caller supplies a position and a report — the
-- things only they can know — and the function derives everything else. The
-- distance in particular is computed here from the task's own target, never
-- accepted from the client, because "I was 12m from the store" is exactly the
-- claim the module exists to verify.

-- Out of range blocks capture, per the design. The threshold is the task's
-- own allowed_radius_m, and — as with attendance — a fix is a circle, so the
-- check is against the near edge of the accuracy circle rather than its
-- centre. Someone genuinely at the door with a poor fix is not turned away.
create or replace function field_visit_in_range(
  distance_m numeric,
  accuracy_m numeric,
  radius_m   numeric
)
returns boolean
language sql
immutable
parallel safe
as $$
  select distance_m is not null
     and greatest(distance_m - coalesce(accuracy_m, 0), 0) <= radius_m;
$$;

comment on function field_visit_in_range is
  'Whether the employee could plausibly be within the target radius. Measured '
  'against the near edge of the accuracy circle: a coarse fix at the door '
  'should not block a genuine visit, and the recorded accuracy lets a '
  'reviewer judge it afterwards.';

create or replace function submit_field_visit(
  p_task_id    uuid,
  p_latitude   numeric default null,
  p_longitude  numeric default null,
  p_accuracy_m numeric default null,
  p_report     text    default null,
  p_outcome    text    default null
)
returns field_visits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_employee uuid := my_employee_id();
  v_task     tasks;
  v_target   task_target_locations;
  v_distance numeric;
  v_codes    text[] := '{}';
  v_state    field_visit_state;
  v_visit    field_visits;
  v_needs_photo  boolean;
  v_needs_report boolean;
begin
  if v_org is null or v_employee is null then
    raise exception 'No employee record for this account in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_task from tasks where id = p_task_id and organization_id = v_org;
  if not found then
    raise exception 'Task not found' using errcode = 'no_data_found';
  end if;

  if not is_assigned_to_me(p_task_id) then
    raise exception 'Only an assignee can submit a visit for this task'
      using errcode = 'insufficient_privilege';
  end if;

  v_needs_photo := v_task.verification_mode in
    ('photo', 'photo_location', 'photo_location_report');
  v_needs_report := v_task.verification_mode = 'photo_location_report';

  if v_needs_report and coalesce(length(trim(p_report)), 0) < 10 then
    raise exception 'This task requires a visit report'
      using errcode = 'check_violation';
  end if;

  select * into v_target from task_target_locations where task_id = p_task_id;

  if v_target.id is not null and p_latitude is not null then
    v_distance := geo_distance_m(p_latitude, p_longitude, v_target.latitude, v_target.longitude);

    -- The block. Refused rather than recorded-and-flagged: the design checks
    -- range before the camera opens, so submitting from the wrong place is
    -- not a state this table should be able to hold.
    if not field_visit_in_range(v_distance, p_accuracy_m, v_target.allowed_radius_m) then
      raise exception
        'You are % from %, outside the % m allowed for this visit',
        round(v_distance) || 'm', v_target.name, v_target.allowed_radius_m
        using errcode = 'check_violation';
    end if;

    if p_accuracy_m is null then
      v_codes := array_append(v_codes, 'no_accuracy');
    elsif p_accuracy_m > 100 then
      v_codes := array_append(v_codes, 'poor_accuracy');
    end if;
  elsif v_task.verification_mode in ('location', 'photo_location', 'photo_location_report') then
    -- Location was required and none arrived. Recorded and reviewed by a
    -- person — the design: "No GPS or no photo is always reviewed by a
    -- person, never auto-rejected."
    v_codes := array_append(v_codes, 'no_location');
  end if;

  -- A person decides whenever anything is off; otherwise it goes to the
  -- reviewer as an ordinary submission.
  v_state := case when array_length(v_codes, 1) > 0
                  then 'flagged'::field_visit_state
                  else 'submitted'::field_visit_state end;

  insert into field_visits (
    organization_id, task_id, employee_id, state, submitted_at,
    latitude, longitude, accuracy_m, distance_m, report, outcome, exception_codes
  )
  values (
    v_org, p_task_id, v_employee, v_state, now(),
    p_latitude, p_longitude, p_accuracy_m, v_distance, p_report, p_outcome, v_codes
  )
  on conflict (id) do nothing
  returning * into v_visit;

  insert into task_activity (organization_id, task_id, actor_id, action, detail)
  values (v_org, p_task_id, auth.uid(), 'visit.submitted',
          jsonb_build_object('distance_m', v_distance, 'accuracy_m', p_accuracy_m,
                             'exceptions', v_codes, 'photo_required', v_needs_photo));

  perform write_audit('field_visit.submit', 'field_visit', v_visit.id::text,
    jsonb_build_object('task', v_task.reference, 'distance_m', v_distance,
                       'accuracy_m', p_accuracy_m, 'state', v_state));

  return v_visit;
end;
$$;

-- Accept or return. A return keeps the original evidence and states why.
create or replace function review_field_visit(
  p_visit_id uuid,
  p_accept   boolean,
  p_reason   text default null
)
returns field_visits
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org   uuid := current_org_id();
  v_visit field_visits;
begin
  if not has_permission('tasks.verify_visit') then
    raise exception 'tasks.verify_visit is required'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_visit from field_visits
  where id = p_visit_id and organization_id = v_org;

  if not found then
    raise exception 'Visit not found' using errcode = 'no_data_found';
  end if;

  if not can_see_task(v_visit.task_id) then
    raise exception 'Not your department''s task'
      using errcode = 'insufficient_privilege';
  end if;

  if not p_accept and coalesce(length(trim(p_reason)), 0) < 10 then
    raise exception
      'Returning a visit needs a reason the assignee can act on'
      using errcode = 'check_violation';
  end if;

  update field_visits
  set state = (case when p_accept then 'verified' else 'returned' end)::field_visit_state,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_reason = p_reason
  where id = p_visit_id
  returning * into v_visit;

  insert into task_activity (organization_id, task_id, actor_id, action, detail)
  values (v_org, v_visit.task_id, auth.uid(),
          case when p_accept then 'visit.verified' else 'visit.returned' end,
          jsonb_build_object('reason', p_reason));

  perform write_audit(
    case when p_accept then 'field_visit.verify' else 'field_visit.return' end,
    'field_visit', p_visit_id::text,
    jsonb_build_object('reason', p_reason, 'original_kept', true));

  return v_visit;
end;
$$;

grant execute on function submit_field_visit(uuid, numeric, numeric, numeric, text, text) to authenticated;
grant execute on function review_field_visit(uuid, boolean, text) to authenticated;
