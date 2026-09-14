-- Rate limiting for the public application form.
--
-- apply_for_job() carried a comment claiming "a simple per-request rate limit,
-- described below". There was no rate limit, below or anywhere else. A comment
-- describing a protection that does not exist is worse than no comment: it
-- stops the next reader looking.
--
-- This is the only unauthenticated write in the product, so it is the one
-- surface where an abuse limit actually matters. Two limits, because they
-- catch different things:
--
--   * Per source, per hour — one person or script hammering the form.
--   * Per organization, per hour — a distributed flood that spreads across
--     addresses and slips the first limit. Deliberately generous: it exists to
--     stop a database filling up overnight, not to turn away a real hiring rush.
--
-- Both are enforced inside apply_for_job(), which is SECURITY DEFINER, so an
-- anonymous caller cannot reach around them. The `unique (job_id, email)`
-- constraint already stopped the same person applying twice to one role; that
-- is a duplicate check, not an abuse limit, and it never was one.

create table public_form_submissions (
  id              bigserial primary key,
  organization_id uuid not null references organizations(id) on delete cascade,
  form            text not null,
  -- Truncated, never the full address. The audit log already holds addresses
  -- this way: enough to recognise a repeat, not enough to locate a person.
  source_key      text,
  created_at      timestamptz not null default now()
);

create index public_form_submissions_org_idx
  on public_form_submissions (organization_id, form, created_at desc);
create index public_form_submissions_source_idx
  on public_form_submissions (source_key, created_at desc)
  where source_key is not null;

alter table public_form_submissions enable row level security;
alter table public_form_submissions force row level security;

-- No policies and no grants. Written only by the function below, read only by
-- it. Nothing reaching the database through the API has any business here —
-- and an attacker who could read it would learn who has been applying.
revoke all on public_form_submissions from anon, authenticated;
revoke all on sequence public_form_submissions_id_seq from anon, authenticated;

comment on table public_form_submissions is
  'Rate-limit ledger for unauthenticated forms. Rows older than the longest '
  'window are dead weight; prune with: delete from public_form_submissions '
  'where created_at < now() - interval ''7 days'';';

create or replace function apply_for_job(
  p_job_id       uuid,
  p_first_name   text,
  p_last_name    text,
  p_email        text,
  p_phone        text default null,
  p_location     text default null,
  p_cover_letter text default null,
  p_cv_path      text default null,
  p_source       text default null,
  p_source_key   text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job jobs;
  v_id  uuid;
  -- Five applications an hour from one source is far above what a real
  -- applicant does and far below what a script wants.
  c_per_source constant integer := 5;
  c_per_org    constant integer := 60;
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

  -- Rate limits. Checked before the insert so a refused attempt costs nothing
  -- but a count, and phrased so a real applicant who hits one knows to wait
  -- rather than thinking their application failed.
  if p_source_key is not null and exists (
    select 1 from public_form_submissions
    where source_key = p_source_key
      and form = 'job_application'
      and created_at > now() - interval '1 hour'
    offset c_per_source - 1
    limit 1
  ) then
    raise exception 'Too many applications from this connection in the last hour. Please try again later.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public_form_submissions
    where organization_id = v_job.organization_id
      and form = 'job_application'
      and created_at > now() - interval '1 hour'
    offset c_per_org - 1
    limit 1
  ) then
    raise exception 'We are receiving a lot of applications right now. Please try again shortly.'
      using errcode = 'check_violation';
  end if;

  -- Body unchanged from 0026 below this point. Reproduced rather than
  -- refactored: the normalisation, the upsert and the stage-history row are
  -- each load-bearing, and the first draft of this migration quietly dropped
  -- all three. The recruitment suite caught it.
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

  -- Recorded after the write succeeds, so a refused or failed attempt does not
  -- spend the applicant's quota.
  insert into public_form_submissions (organization_id, form, source_key)
  values (v_job.organization_id, 'job_application', p_source_key);

  return v_id;
end;
$$;

-- The old nine-argument signature would still be callable and would still
-- bypass every limit above. Drop it.
drop function if exists apply_for_job(uuid, text, text, text, text, text, text, text, text);

grant execute on function
  apply_for_job(uuid, text, text, text, text, text, text, text, text, text)
  to anon, authenticated;
