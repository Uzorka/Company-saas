-- Reporting aggregates.
--
-- These are SECURITY INVOKER — the default, and stated here because it is the
-- whole design. Every one of them reads through the caller's own RLS, so an
-- HOD asking for attendance gets their department and Management gets the
-- company, from the same function with no branching on role. A SECURITY
-- DEFINER report function would bypass the policies and become a second,
-- weaker copy of the authorisation model.
--
-- Aggregated in SQL rather than by fetching rows and counting in TypeScript.
-- Thirty days of attendance for a 500-person company is 15,000 rows; sending
-- those to a server component to be counted is a lot of bytes to answer a
-- question Postgres can answer in one.

-- Headcount by department. Exited staff are excluded but not deleted, so this
-- is "who works here now", not "who is on file".
create or replace function report_headcount()
returns table (
  department_id   uuid,
  department_name text,
  headcount       bigint,
  on_probation    bigint,
  full_time       bigint
)
language sql
stable
as $$
  select
    d.id,
    d.name,
    count(e.id),
    count(e.id) filter (where e.employment_status = 'probation'),
    count(e.id) filter (where e.employment_type = 'full_time')
  from departments d
  left join employees e
    on e.department_id = d.id
   and e.employment_status <> 'exited'
  group by d.id, d.name
  order by d.name;
$$;

-- Attendance over a window, by day.
--
-- `expected` is deliberately absent: it would need each employee's shift
-- pattern and the public holiday calendar, and the calendar is still missing
-- (docs/BACKLOG.md). A denominator guessed from weekdays would make an
-- attendance rate that looks authoritative and is not.
create or replace function report_attendance(p_from date, p_to date)
returns table (
  work_date date,
  records   bigint,
  at_office bigint,
  remote    bigint,
  late      bigint,
  in_review bigint
)
language sql
stable
as $$
  select
    a.work_date,
    count(*),
    count(*) filter (where a.attendance_type = 'office'),
    count(*) filter (where a.attendance_type = 'remote'),
    count(*) filter (where a.late_by_minutes is not null and a.late_by_minutes > 0),
    count(*) filter (where a.review_state = 'pending')
  from attendance_records a
  where a.work_date between p_from and p_to
  group by a.work_date
  order by a.work_date;
$$;

-- Leave for a year, by type. Days taken come from approved requests only —
-- the same rule the balance follows (D42), so the two agree.
create or replace function report_leave(p_year integer)
returns table (
  leave_type text,
  requests   bigint,
  approved   bigint,
  pending    bigint,
  declined   bigint,
  days_taken numeric
)
language sql
stable
as $$
  select
    lt.name,
    count(r.id),
    count(r.id) filter (where r.status = 'approved'),
    count(r.id) filter (where r.status in ('pending_hod', 'pending_hr')),
    count(r.id) filter (where r.status = 'declined'),
    coalesce(sum(r.days_requested) filter (where r.status = 'approved'), 0)
  from leave_types lt
  left join leave_requests r
    on r.leave_type_id = lt.id
   and extract(year from r.starts_on) = p_year
  group by lt.name
  order by lt.name;
$$;

-- One payroll run, by department. Reads payroll_run_lines, which carry their
-- own denormalised department name — so a run reports the structure as it was
-- when it was costed, not as it is today (D47).
create or replace function report_payroll(p_period_id uuid)
returns table (
  department_name text,
  headcount       bigint,
  gross           numeric,
  paye            numeric,
  pension         numeric,
  net             numeric
)
language sql
stable
as $$
  select
    coalesce(l.department_name, 'Unassigned'),
    count(*),
    sum(l.gross_pay),
    sum(l.paye),
    sum(l.pension_employee),
    sum(l.net_pay)
  from payroll_run_lines l
  where l.payroll_period_id = p_period_id
  group by coalesce(l.department_name, 'Unassigned')
  order by sum(l.gross_pay) desc;
$$;

grant execute on function report_headcount() to authenticated;
grant execute on function report_attendance(date, date) to authenticated;
grant execute on function report_leave(integer) to authenticated;
grant execute on function report_payroll(uuid) to authenticated;
