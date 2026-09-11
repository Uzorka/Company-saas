-- 0014_attendance_actions
--
-- The only ways to write an attendance record.
--
-- Both are `security definer` and derive everything they can rather than
-- accepting it. The caller supplies a position and an accuracy — facts only
-- their device knows — and nothing else. In particular the caller cannot
-- supply:
--
--   * the employee the record belongs to  (taken from their own identity)
--   * the organization                    (taken from their own claim)
--   * the time                            (now(), server-side)
--   * the classification                  (computed from the position)
--   * whether it needs review             (computed)
--
-- An employee therefore cannot record themselves as being at the office by
-- posting a chosen value, which is the whole point of the module.

create or replace function check_in(
  p_latitude   numeric default null,
  p_longitude  numeric default null,
  p_accuracy_m numeric default null,
  p_device     text    default null
)
returns attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org        uuid := current_org_id();
  v_employee   uuid := my_employee_id();
  v_office     uuid;
  v_distance   numeric;
  v_radius     integer;
  v_type       attendance_type;
  v_codes      text[];
  v_tz         text;
  v_shift      record;
  v_record     attendance_records;
  v_work_date  date;
begin
  if v_org is null or v_employee is null then
    raise exception 'No employee record for this account in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  if not has_permission('attendance.check_in') then
    raise exception 'attendance.check_in is required'
      using errcode = 'insufficient_privilege';
  end if;

  select timezone into v_tz from organization_settings where organization_id = v_org;
  v_tz := coalesce(v_tz, 'UTC');
  v_work_date := (now() at time zone v_tz)::date;

  -- Already checked in? Return the open record rather than failing. The
  -- design turns the CTA into "Check out" in that state; a duplicate attempt
  -- is a navigation problem, not an error to shout about.
  select * into v_record
  from attendance_records
  where employee_id = v_employee and state = 'checked_in';

  if found then
    return v_record;
  end if;

  if p_latitude is not null and p_longitude is not null then
    select o.office_id, o.distance_m, o.radius_m
      into v_office, v_distance, v_radius
    from nearest_office(v_org, p_latitude, p_longitude) o;
  end if;

  -- No office configured, or no position: fall back to the organization's
  -- default radius so classification still has something to measure against.
  if v_radius is null then
    select default_geofence_radius_m into v_radius
    from organization_settings where organization_id = v_org;
  end if;

  v_type := classify_attendance(v_distance, p_accuracy_m, v_radius);
  -- has_selfie is false here by construction: evidence is attached after the
  -- record exists. The code is recalculated when the selfie lands.
  v_codes := attendance_exception_codes(v_distance, p_accuracy_m, v_radius, true, v_type);

  select sp.starts_at, sp.grace_minutes into v_shift
  from employee_shifts es
  join shift_patterns sp on sp.id = es.shift_pattern_id
  where es.employee_id = v_employee
    and es.effective_from <= v_work_date
    and (es.effective_to is null or es.effective_to > v_work_date)
  order by es.effective_from desc
  limit 1;

  insert into attendance_records (
    organization_id, employee_id, office_id, work_date,
    check_in_latitude, check_in_longitude, check_in_accuracy_m, check_in_distance_m,
    attendance_type, state, review_state, exception_codes, late_by_minutes, device
  )
  values (
    v_org, v_employee, v_office, v_work_date,
    p_latitude, p_longitude, p_accuracy_m, v_distance,
    v_type, 'checked_in',
    (case when attendance_needs_review(v_codes)
          then 'pending' else 'not_required' end)::attendance_review_state,
    v_codes,
    minutes_late(now(), v_shift.starts_at, v_shift.grace_minutes, v_tz),
    p_device
  )
  returning * into v_record;

  perform write_audit(
    'attendance.check_in', 'attendance_record', v_record.id::text,
    jsonb_build_object(
      'type', v_type, 'distance_m', v_distance,
      'accuracy_m', p_accuracy_m, 'exceptions', v_codes
    )
  );

  return v_record;
end;
$$;

create or replace function check_out(
  p_latitude   numeric default null,
  p_longitude  numeric default null,
  p_accuracy_m numeric default null
)
returns attendance_records
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_org      uuid := current_org_id();
  v_employee uuid := my_employee_id();
  v_distance numeric;
  v_record   attendance_records;
begin
  if v_org is null or v_employee is null then
    raise exception 'No employee record for this account in this organization'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_record
  from attendance_records
  where employee_id = v_employee and state = 'checked_in';

  if not found then
    raise exception 'Not checked in' using errcode = 'no_data_found';
  end if;

  if p_latitude is not null and p_longitude is not null and v_record.office_id is not null then
    select geo_distance_m(p_latitude, p_longitude, o.latitude, o.longitude)
      into v_distance
    from offices o where o.id = v_record.office_id;
  end if;

  update attendance_records
  set check_out_at = now(),
      check_out_latitude = p_latitude,
      check_out_longitude = p_longitude,
      check_out_accuracy_m = p_accuracy_m,
      check_out_distance_m = v_distance,
      state = 'checked_out'
  where id = v_record.id
  returning * into v_record;

  perform write_audit('attendance.check_out', 'attendance_record', v_record.id::text,
    jsonb_build_object('distance_m', v_distance, 'accuracy_m', p_accuracy_m));

  return v_record;
end;
$$;

-- Auto-close records left open past midnight.
--
-- The design: "check-out missing at midnight (auto-closes and flags, never
-- deletes)". The record keeps its check-in exactly as captured; only the
-- closure is added, and it is flagged so a person decides what the day was
-- worth rather than the system guessing.
create or replace function auto_close_stale_attendance()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  closed integer;
begin
  with stale as (
    select r.id, os.timezone
    from attendance_records r
    join organization_settings os on os.organization_id = r.organization_id
    where r.state = 'checked_in'
      and r.work_date < (now() at time zone coalesce(os.timezone, 'UTC'))::date
  )
  update attendance_records r
  set state = 'auto_closed',
      -- Midnight after the working day, but never before the check-in itself.
      -- work_date and check_in_at can disagree — a record created either side
      -- of a timezone boundary, or one whose work_date was corrected — and a
      -- check-out earlier than its check-in is not a closure, it is a broken
      -- row the constraint would rightly refuse.
      check_out_at = greatest(
        ((r.work_date + 1) || ' 00:00:00')::timestamp
          at time zone coalesce(stale.timezone, 'UTC'),
        r.check_in_at
      ),
      review_state = 'pending',
      exception_codes = array_append(r.exception_codes, 'no_check_out')
  from stale
  where r.id = stale.id;

  get diagnostics closed = row_count;
  return closed;
end;
$$;

comment on function auto_close_stale_attendance is
  'Closes records left open past their working day and flags them for review. '
  'Never deletes, and never alters the captured check-in. Schedule nightly '
  'with pg_cron.';

grant execute on function check_in(numeric, numeric, numeric, text) to authenticated;
grant execute on function check_out(numeric, numeric, numeric) to authenticated;
revoke execute on function auto_close_stale_attendance() from public, authenticated, anon;
