-- 0012_geofence
--
-- Distance and classification, in SQL so the database and the application
-- cannot disagree about whether someone was at the office.
--
-- The rule, stated carefully, because this is where the product is most
-- tempted to overclaim:
--
--   A GPS fix is a circle, not a point. `accuracy_m` is the radius of that
--   circle. So the honest question is not "is the reported point inside the
--   fence" but "can we tell which side of the fence the person is on".
--
--     distance + accuracy <= radius   -> certainly inside   -> office
--     distance - accuracy >  radius   -> certainly outside  -> remote
--     otherwise                       -> cannot tell        -> uncertain
--
--   The design's own example: a 10m radius with a ±50m fix cannot be resolved
--   either way, and must be reviewed rather than asserted.
--
-- Classification and review are separate concerns. A fix can be geometrically
-- decisive and still be poor enough in absolute terms to deserve a human
-- glance — 3.8km away with ±140m is certainly outside the fence, but the
-- employee's claim about *where* they are is not corroborated.

-- Great-circle distance in metres. Haversine on a spherical earth: accurate
-- to ~0.5%, which is far inside any GPS error we will ever see here, and it
-- avoids a PostGIS dependency for one function.
create or replace function geo_distance_m(
  lat1 numeric, lon1 numeric,
  lat2 numeric, lon2 numeric
)
returns numeric
language sql
immutable
parallel safe
as $$
  select round(
    (6371000 * 2 * asin(
      sqrt(
        power(sin(radians(lat2 - lat1) / 2), 2) +
        cos(radians(lat1)) * cos(radians(lat2)) *
        power(sin(radians(lon2 - lon1) / 2), 2)
      )
    ))::numeric
  , 2);
$$;

comment on function geo_distance_m is
  'Great-circle distance in metres (haversine). Spherical-earth approximation, '
  'accurate to roughly 0.5% — well inside GPS error at any distance this '
  'product cares about.';

-- Classify a fix against a fence.
--
-- `accuracy_m` null means the device gave no accuracy figure. That is not the
-- same as a perfect fix, so it is treated as unresolvable rather than exact.
create or replace function classify_attendance(
  distance_m  numeric,
  accuracy_m  numeric,
  radius_m    numeric
)
returns attendance_type
language sql
immutable
parallel safe
as $$
  select case
    when distance_m is null then 'uncertain'::attendance_type
    when accuracy_m is null then 'uncertain'::attendance_type
    when distance_m + accuracy_m <= radius_m then 'office'::attendance_type
    when distance_m - accuracy_m >  radius_m then 'remote'::attendance_type
    else 'uncertain'::attendance_type
  end;
$$;

comment on function classify_attendance is
  'Office / remote / uncertain from distance, accuracy and radius. A fix is a '
  'circle: only a fix whose whole circle falls on one side of the fence is '
  'decisive. Everything else is uncertain and goes to a person.';

-- Absolute-accuracy threshold beyond which a fix is flagged for review even
-- when it is geometrically decisive. 100m is a judgement, not a design
-- constant — the design shows ±140m treated as needing attention and ±8-12m
-- treated as routine.
create or replace function attendance_exception_codes(
  distance_m   numeric,
  accuracy_m   numeric,
  radius_m     numeric,
  has_selfie   boolean,
  classified   attendance_type
)
returns text[]
language sql
immutable
parallel safe
as $$
  select array_remove(array[
    case when distance_m is null then 'no_location' end,
    case when accuracy_m is null and distance_m is not null then 'no_accuracy' end,
    case when accuracy_m is not null and accuracy_m > 100 then 'poor_accuracy' end,
    case when classified = 'uncertain' then 'position_unresolved' end,
    case when not has_selfie then 'no_selfie' end
  ], null);
$$;

-- Does this record need a person to look at it?
create or replace function attendance_needs_review(codes text[])
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce(array_length(codes, 1), 0) > 0;
$$;

-- Minutes late against a shift, or null when the employee has no shift on
-- that date. Null is not zero: "not applicable" and "on time" are different
-- facts, and reporting them as the same would overstate punctuality.
create or replace function minutes_late(
  check_in_at   timestamptz,
  shift_start   time,
  grace_minutes integer,
  tz            text
)
returns integer
language sql
stable
as $$
  select case
    when shift_start is null then null
    else greatest(
      0,
      (extract(epoch from (
        (check_in_at at time zone tz)::time - shift_start
      )) / 60)::integer - coalesce(grace_minutes, 0)
    )
  end;
$$;

-- Nearest active office to a fix, with the distance to it.
create or replace function nearest_office(
  p_organization_id uuid,
  p_latitude        numeric,
  p_longitude       numeric
)
returns table (office_id uuid, distance_m numeric, radius_m integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.id,
         geo_distance_m(p_latitude, p_longitude, o.latitude, o.longitude),
         o.geofence_radius_m
  from offices o
  where o.organization_id = p_organization_id
    and o.active
  order by geo_distance_m(p_latitude, p_longitude, o.latitude, o.longitude)
  limit 1;
$$;
