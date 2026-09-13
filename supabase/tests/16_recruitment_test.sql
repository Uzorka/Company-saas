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
