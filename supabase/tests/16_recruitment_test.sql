-- Recruitment, and the one public surface in the product.
--
-- The question: can an anonymous visitor to the careers site reach anything
-- other than the roles the company chose to publish?
--
-- Depends on fixtures from 10-15.

set client_min_messages = notice;

do $$
declare
  f record;
  org_a uuid; org_b uuid;
  dept_sales uuid;
  job_open uuid; job_draft uuid;
  app_id uuid;
  emp employees;
  n integer;
begin
  select * into f from fixture;
  org_a := f.org_a; org_b := f.org_b;
  select id into dept_sales from departments where code = 'DPT-SLS' and organization_id = org_a;

  insert into jobs (organization_id, title, slug, department_id, location, status, published_at, created_by)
  values (org_a, 'Field Sales Representative', 'field-sales-representative', dept_sales,
          'Lagos', 'published', now(), f.u_hr)
  returning id into job_open;

  insert into jobs (organization_id, title, slug, status, created_by)
  values (org_a, 'Head of Something Unannounced', 'unannounced', 'draft', f.u_hr)
  returning id into job_draft;

  insert into jobs (organization_id, title, slug, status, published_at)
  values (org_b, 'Rival Role', 'rival-role', 'published', now());

  -- === What the public can see ============================================
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  perform assert((select count(*) from jobs) = 2,
    'An anonymous visitor sees published roles only — two across both tenants');
  perform assert((select count(*) from jobs where status <> 'published') = 0,
    'A draft role is invisible to the public');
  reset role;

  perform assert(
    denies('{}'::jsonb, 'select count(*) from job_applications', 'anon'),
    'An anonymous visitor cannot read applicants at all');

  perform assert(
    denies('{}'::jsonb, 'select count(*) from application_notes', 'anon'),
    'An anonymous visitor cannot read panel notes');

  perform assert(
    denies('{}'::jsonb, 'select count(*) from employees', 'anon'),
    'An anonymous visitor cannot read employees');

  -- === Applying ===========================================================
  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  select apply_for_job(job_open, 'Blessing', 'Nwachukwu', 'blessing@example.com',
    '+2348000000000', 'Lagos', 'Five years in FMCG field sales.') into app_id;
  reset role;

  perform assert(app_id is not null, 'A member of the public can apply to a published role');

  select count(*) into n from application_stage_history where application_id = app_id;
  perform assert(n = 1, 'The application is recorded in the stage history');

  perform assert(
    denies('{}'::jsonb,
      'select apply_for_job(''' || job_draft || ''', ''A'', ''B'', ''a@example.com'')',
      'anon'),
    'An unpublished role cannot be applied to, even with its id');

  perform set_config('request.jwt.claims', '{}', true);
  set local role anon;
  perform apply_for_job(job_open, 'Blessing', 'Nwachukwu', 'blessing@example.com',
    '+2348000000001', 'Lagos', 'Updated cover letter.');
  reset role;

  select count(*) into n from job_applications where job_id = job_open;
  perform assert(n = 1, 'Applying twice updates the application rather than duplicating it');

  -- === Pipeline ===========================================================
  perform assert(
    denies(claims_for(f.u_acct, org_a),
      'select move_application_stage(''' || app_id || ''', ''screening'')'),
    'Accounts cannot move an applicant — the matrix gives it no recruitment access');

  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  perform move_application_stage(app_id, 'screening');
  perform move_application_stage(app_id, 'shortlisted');
  perform move_application_stage(app_id, 'interview');
  reset role;

  select count(*) into n from application_stage_history where application_id = app_id;
  -- Five, not four: the re-application above is itself an event. The candidate
  -- did submit twice, and a timeline that hides one of them is less honest
  -- than one that shows both.
  perform assert(n = 5,
    'Every stage move is recorded, including the original and repeat applications');

  perform assert(
    denies(claims_for(f.u_hr, org_a),
      'select move_application_stage(''' || app_id || ''', ''hired'')'),
    'Hiring happens through conversion, not a stage change');

  perform assert(
    denies(claims_for(f.u_hr, org_a),
      'select move_application_stage(''' || app_id || ''', ''rejected'', ''no'')'),
    'Rejecting someone with a two-word note is refused');

  -- === Conversion =========================================================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, org_a)::text, true);
  set local role authenticated;
  select * into emp from convert_applicant_to_employee(app_id, 'EMP-0301', dept_sales, null, current_date);
  reset role;

  perform assert(emp.first_name = 'Blessing',
    'The employee record carries the applicant details');
  perform assert(emp.user_id is null,
    'No auth account is created — the record exists before any invitation');

  select count(*) into n from job_applications where id = app_id and stage = 'hired';
  perform assert(n = 1, 'The application is kept and marked hired, not deleted');

  select count(*) into n from applicant_conversions where application_id = app_id;
  perform assert(n = 1, 'The conversion links the application to the employee');

  perform assert(
    denies(claims_for(f.u_hr, org_a),
      'select convert_applicant_to_employee(''' || app_id || ''', ''EMP-0302'')'),
    'An applicant cannot be converted twice');

  -- === Tenant isolation ===================================================
  perform set_config('request.jwt.claims', claims_for(f.u_other, org_b)::text, true);
  set local role authenticated;
  perform assert((select count(*) from job_applications) = 0,
    'Another tenant sees none of this organisation''s applicants');
  reset role;

  raise notice '--- recruitment assertions passed ---';
end
$$;


-- ---------------------------------------------------------------------------
-- The hiring pipeline: hold, interview, offer, and the emails.
--
-- The board could display an applicant and do nothing to one. These assert
-- what the new actions rest on — and that the email a candidate was sent is
-- written by the same statement as the move, so the two cannot come apart.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  v_job uuid;
  v_app uuid;
  v_emp employees;
  n integer;
  failed boolean;
begin
  select * into f from fixture;

  select id into v_job from jobs where organization_id = f.org_a limit 1;
  perform assert(v_job is not null, 'There is a job to apply to');

  insert into job_applications
    (organization_id, job_id, first_name, last_name, email, phone, location)
  values (f.org_a, v_job, 'Chiamaka', 'Nwosu', 'chiamaka.nwosu@example.com',
          '+234 800 111 2222', 'Yaba, Lagos')
  returning id into v_app;

  -- === Holding is orthogonal to stage =====================================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
  set local role authenticated;
  perform hold_application(v_app, 'Waiting on the budget sign-off.');
  reset role;

  perform assert(
    (select stage from job_applications where id = v_app) = 'applied',
    'A hold leaves the candidate at the stage they were actually at'
  );
  perform assert(
    (select on_hold_at is not null from job_applications where id = v_app),
    'and marks them held'
  );

  -- === Shortlisting lifts the hold and writes one email ===================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
  set local role authenticated;
  perform move_application_stage(v_app, 'shortlisted', null);
  reset role;

  perform assert(
    (select on_hold_at is null from job_applications where id = v_app),
    'A decision lifts the hold'
  );

  select count(*) into n from outbound_emails
   where application_id = v_app and template = 'shortlisted';
  perform assert(n = 1, 'Shortlisting queues exactly one email');

  perform assert(
    (select to_email from outbound_emails
      where application_id = v_app and template = 'shortlisted')
      = 'chiamaka.nwosu@example.com',
    'addressed to the applicant'
  );
  perform assert(
    (select body like '%Chiamaka Nwosu%' from outbound_emails
      where application_id = v_app and template = 'shortlisted'),
    'and names them in full, which is the whole point of it'
  );

  -- === The audit entry records where they came FROM ========================
  -- It recorded from = to until 0034: the update reassigned the row before
  -- write_audit read the old stage off it.
  perform assert(
    (select metadata ->> 'from' from audit_logs
      where entity_id = v_app::text and action = 'recruitment.stage'
      order by id desc limit 1) = 'applied',
    'A stage change is audited as coming from where it actually came from'
  );

  -- === Interviews ==========================================================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
  set local role authenticated;
  perform schedule_application_interview(
    v_app, now() + interval '3 days', 'Head Office, Victoria Island', null);
  reset role;

  perform assert(
    (select stage from job_applications where id = v_app) = 'interview',
    'Scheduling moves them to interview'
  );
  perform assert(
    (select count(*) from outbound_emails
      where application_id = v_app and template = 'interview') = 1,
    'and queues the invitation'
  );

  -- A time in the past is refused: the email would be nonsense.
  failed := false;
  begin
    perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
    set local role authenticated;
    perform schedule_application_interview(v_app, now() - interval '1 day', null, null);
    reset role;
  exception when others then
    failed := true;
    reset role;
  end;
  perform assert(failed, 'An interview cannot be scheduled in the past');

  -- === Hiring ==============================================================
  perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
  set local role authenticated;
  select * into v_emp from convert_applicant_to_employee(
    v_app, 'CHF-9001', null, null, current_date, 'full_time');
  reset role;

  perform assert(v_emp.id is not null, 'Hiring creates the employee record');
  perform assert(
    (select stage from job_applications where id = v_app) = 'hired',
    'and moves the application to hired'
  );
  perform assert(
    (select count(*) from outbound_emails
      where application_id = v_app and template = 'offer') = 1,
    'and queues the offer'
  );
  perform assert(
    (select body like '%CHF-9001%' from outbound_emails
      where application_id = v_app and template = 'offer'),
    'naming the employee number they will be known by'
  );
  -- The chosen behaviour: the offer carries no salary figure, so HR can send
  -- it without holding payroll access.
  perform assert(
    (select body not ilike '%salary%' or body ilike '%follow in a separate%'
       from outbound_emails where application_id = v_app and template = 'offer'),
    'and no pay figure — terms follow separately'
  );

  -- Hiring the same person twice is impossible, not merely discouraged.
  failed := false;
  begin
    perform set_config('request.jwt.claims', claims_for(f.u_hr, f.org_a)::text, true);
    set local role authenticated;
    perform convert_applicant_to_employee(v_app, 'CHF-9002', null, null, current_date, 'full_time');
    reset role;
  exception when others then
    failed := true;
    reset role;
  end;
  perform assert(failed, 'The same applicant cannot be hired twice');

  raise notice '--- hiring pipeline assertions passed ---';
end
$$;


-- ---------------------------------------------------------------------------
-- What the company told a candidate is not something it can quietly revise.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  v_email uuid;
begin
  select * into f from fixture;
  select id into v_email from outbound_emails limit 1;
  perform assert(v_email is not null, 'There is a queued email to try this on');

  perform assert(
    rows_changed_by(
      claims_for(f.u_hr, f.org_a),
      format('update outbound_emails set body = ''Never mind.'' where id = %L', v_email)
    ) = 0,
    'Nobody can rewrite an email the pipeline sent'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_mgmt, f.org_a),
      format('delete from outbound_emails where id = %L', v_email)
    ) = 0,
    'and nobody can delete one, including Management'
  );

  perform assert(
    rows_changed_by(
      claims_for(f.u_emp, f.org_a),
      format($q$insert into outbound_emails
                 (organization_id, template, to_email, to_name, subject, body)
               values (%L, 'forged', 'someone@example.com', 'Someone', 'Hi', 'Hello')$q$,
             f.org_a)
    ) = 0,
    'and no client can forge one'
  );

  raise notice '--- outbound email assertions passed ---';
end
$$;
