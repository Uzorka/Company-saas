-- 0027_recruitment_rls
--
-- Recruitment policies.
--
-- The only place in this product where `anon` gets a read policy: published
-- jobs are, by definition, public. Everything else about recruitment —
-- applicants, CVs, notes — stays inside the tenant.

alter table jobs                      enable row level security;
alter table job_applications          enable row level security;
alter table application_stage_history enable row level security;
alter table application_notes         enable row level security;
alter table applicant_conversions     enable row level security;

alter table jobs                      force row level security;
alter table job_applications          force row level security;
alter table application_stage_history force row level security;
alter table application_notes         force row level security;
alter table applicant_conversions     force row level security;

-- Published jobs are readable by the public careers site. Draft and closed
-- roles are not: a role still being written should not be discoverable.
create policy jobs_public_read on jobs
  for select to anon, authenticated
  using (status = 'published');

create policy jobs_internal_read on jobs
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

create policy jobs_manage on jobs
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.manage_jobs'))
  with check (organization_id = current_org_id() and has_permission('recruitment.manage_jobs'));

-- Applicants are never public. There is no anon read policy here, and
-- applications are written only through apply_for_job().
create policy applications_read on job_applications
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

create policy applications_manage on job_applications
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.manage_applications'))
  with check (organization_id = current_org_id() and has_permission('recruitment.manage_applications'));

-- No delete policy: a rejected candidate stays searchable, per the design.

create policy stage_history_read on application_stage_history
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

create policy notes_read on application_notes
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

create policy notes_insert on application_notes
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('recruitment.view')
    and author_id = auth.uid()
  );

create policy conversions_read on applicant_conversions
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('recruitment.view'));

grant select on jobs to anon, authenticated;
grant select on job_applications, application_stage_history, application_notes,
                applicant_conversions
  to authenticated;
grant insert, update, delete on jobs to authenticated;
grant update on job_applications to authenticated;
grant insert on application_notes to authenticated;
