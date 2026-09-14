-- Audit the create paths.
--
-- The database functions — check in, leave, payroll, recruitment stages —
-- have called write_audit() since they were written. The plain inserts added
-- with the create UI did not: creating an employee, a department, a position,
-- a task, a payroll period or a job left no trace at all.
--
-- That is the gap worth closing before the audit screen exists, because an
-- audit log that silently omits a class of action is worse than none. Someone
-- reading it concludes nothing happened.
--
-- Triggers rather than calls in the server actions. A caller can forget; a
-- trigger cannot, and it also covers rows created by a future import, an admin
-- fixing something in the SQL editor, or a second client we have not built.

-- ---------------------------------------------------------------------------
-- current_org_id() tolerates an empty claims setting.
--
-- It cast `current_setting('request.jwt.claims', true)` straight to jsonb.
-- That returns NULL when the setting was never set, which the cast handles —
-- but an empty *string* is not NULL, and ''::jsonb raises
-- "invalid input syntax for type json".
--
-- Nothing hit that path before, because every caller already had claims by the
-- time a policy ran. The insert triggers below call it on every insert, which
-- is what surfaced it.
--
-- It matters beyond the triggers: every RLS policy in the product calls this
-- function, so an empty claims header turns what should be a clean denial into
-- a database error. Returning NULL is the correct answer to "which
-- organization is this?" when there is no usable claim, and NULL fails every
-- policy closed, exactly as an absent claim already did.
create or replace function current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'organization_id',
      ''
    ),
    ''
  )::uuid;
$$;

create or replace function audit_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   jsonb;
  v_label text;
begin
  -- write_audit() needs an organization-scoped session. Seeds and migrations
  -- run without one, and failing an insert because it could not be *logged*
  -- would be the tail wagging the dog. Skip silently in that case; every
  -- write that comes through the application has a session by definition.
  if current_org_id() is null then
    return new;
  end if;

  -- Fields are read through to_jsonb rather than as `new.<column>`, because
  -- plpgsql compiles every branch of a CASE against the actual row type: a
  -- reference to new.name in the departments branch fails on a jobs row even
  -- though that branch is never taken. A missing jsonb key is just NULL.
  v_row := to_jsonb(new);

  -- A label a person can read in the log without going to fetch the row.
  v_label := case tg_table_name
    when 'employees' then
      (v_row ->> 'first_name') || ' ' || (v_row ->> 'last_name')
      || ' (' || (v_row ->> 'employee_no') || ')'
    when 'departments'     then (v_row ->> 'name') || ' (' || (v_row ->> 'code') || ')'
    when 'positions'       then v_row ->> 'title'
    when 'tasks'           then (v_row ->> 'reference') || ' — ' || (v_row ->> 'title')
    when 'payroll_periods' then v_row ->> 'label'
    when 'jobs'            then v_row ->> 'title'
    when 'offices'         then v_row ->> 'name'
    else null
  end;

  perform write_audit(
    tg_table_name || '.create',
    tg_table_name,
    v_row ->> 'id',
    jsonb_strip_nulls(jsonb_build_object('label', v_label))
  );

  return new;
end;
$$;

create trigger employees_audit_insert
  after insert on employees
  for each row execute function audit_insert();

create trigger departments_audit_insert
  after insert on departments
  for each row execute function audit_insert();

create trigger positions_audit_insert
  after insert on positions
  for each row execute function audit_insert();

create trigger tasks_audit_insert
  after insert on tasks
  for each row execute function audit_insert();

create trigger payroll_periods_audit_insert
  after insert on payroll_periods
  for each row execute function audit_insert();

create trigger jobs_audit_insert
  after insert on jobs
  for each row execute function audit_insert();

create trigger offices_audit_insert
  after insert on offices
  for each row execute function audit_insert();

-- Publishing a job is the one workspace action that puts text on the public
-- internet, so it is logged as its own event rather than folded into a generic
-- update. Draft -> published only; the reverse is an unpublish and is logged
-- as one.
create or replace function audit_job_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if current_org_id() is null or new.status = old.status then
    return new;
  end if;

  perform write_audit(
    'jobs.' || new.status::text,
    'jobs',
    new.id::text,
    jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status)
  );

  return new;
end;
$$;

create trigger jobs_audit_status
  after update of status on jobs
  for each row execute function audit_job_status();
