-- 0017_tasks_rls
--
-- Task and field-visit policies, plus the submit/review write paths.
--
-- The scope shape here differs from employees: an assignee sees a task
-- because it was given to them, not because of their department. So
-- "view_assigned" resolves through task_assignees, and someone can hold it
-- without holding any departmental scope at all.

alter table tasks                  enable row level security;
alter table task_assignees         enable row level security;
alter table task_target_locations  enable row level security;
alter table task_comments          enable row level security;
alter table task_attachments       enable row level security;
alter table task_activity          enable row level security;
alter table field_visits           enable row level security;
alter table field_visit_evidence   enable row level security;

alter table tasks                  force row level security;
alter table task_target_locations  force row level security;
alter table task_comments          force row level security;
alter table task_attachments       force row level security;
alter table task_activity          force row level security;
alter table field_visits           force row level security;
alter table field_visit_evidence   force row level security;

-- Is this task assigned to the caller? Defined once; several policies use it.
create or replace function is_assigned_to_me(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from task_assignees ta
    where ta.task_id = target_task_id
      and ta.employee_id = my_employee_id()
  );
$$;

-- Can the caller see this task at all? The three scopes, ORed.
create or replace function can_see_task(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from tasks t
    where t.id = target_task_id
      and t.organization_id = current_org_id()
      and (
        has_permission('tasks.view_all')
        or (has_permission('tasks.view_department')
            and t.department_id in (select headed_department_ids()))
        or (has_permission('tasks.view_assigned') and is_assigned_to_me(t.id))
      )
  );
$$;

create policy tasks_select_all on tasks
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('tasks.view_all'));

create policy tasks_select_department on tasks
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('tasks.view_department')
    and department_id in (select headed_department_ids())
  );

create policy tasks_select_assigned on tasks
  for select to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('tasks.view_assigned')
    and is_assigned_to_me(id)
  );

create policy tasks_insert on tasks
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('tasks.create')
    and created_by = auth.uid()
    -- An HOD may only create work inside a department they head. Without
    -- this, tasks.create would let them assign across the whole company.
    and (
      has_permission('tasks.assign_any')
      or department_id in (select headed_department_ids())
    )
  );

create policy tasks_update_any on tasks
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('tasks.update_any'))
  with check (organization_id = current_org_id() and has_permission('tasks.update_any'));

create policy tasks_update_assigned on tasks
  for update to authenticated
  using (
    organization_id = current_org_id()
    and has_permission('tasks.update_assigned')
    and is_assigned_to_me(id)
  )
  with check (organization_id = current_org_id() and is_assigned_to_me(id));

-- No delete policy. A cancelled task is status 'cancelled' and stays visible;
-- deleting work someone did is how history disappears.

create policy task_assignees_select on task_assignees
  for select to authenticated
  using (can_see_task(task_id));

create policy task_assignees_manage on task_assignees
  for all to authenticated
  using (
    exists (
      select 1 from tasks t
      where t.id = task_assignees.task_id
        and t.organization_id = current_org_id()
        and (
          has_permission('tasks.assign_any')
          or (has_permission('tasks.assign_department')
              and t.department_id in (select headed_department_ids()))
        )
    )
  )
  with check (
    exists (
      select 1 from tasks t
      where t.id = task_assignees.task_id
        and t.organization_id = current_org_id()
        and (
          has_permission('tasks.assign_any')
          or (has_permission('tasks.assign_department')
              and t.department_id in (select headed_department_ids()))
        )
    )
  );

create policy task_locations_select on task_target_locations
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

create policy task_locations_manage on task_target_locations
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('tasks.create'))
  with check (organization_id = current_org_id() and has_permission('tasks.create'));

create policy task_comments_select on task_comments
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

create policy task_comments_insert on task_comments
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('tasks.comment')
    and author_id = auth.uid()
    and can_see_task(task_id)
  );

-- Comments are not editable or deletable: a conversation someone acted on is
-- not something to quietly rewrite.

create policy task_attachments_select on task_attachments
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

create policy task_attachments_insert on task_attachments
  for insert to authenticated
  with check (organization_id = current_org_id() and can_see_task(task_id));

create policy task_activity_select on task_activity
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

-- Activity is written by the functions below, never by a client.


-- ---------------------------------------------------------------------------
-- field_visits
-- ---------------------------------------------------------------------------
create policy field_visits_select on field_visits
  for select to authenticated
  using (organization_id = current_org_id() and can_see_task(task_id));

-- No insert, update or delete policy. Visits are created with the task and
-- advanced only by submit_field_visit() and review_field_visit(), which are
-- security definer and derive the position, distance and identity themselves.

create policy field_visit_evidence_select on field_visit_evidence
  for select to authenticated
  using (
    organization_id = current_org_id()
    and exists (
      select 1 from field_visits v
      where v.id = field_visit_evidence.field_visit_id
        and can_see_task(v.task_id)
    )
  );

create policy field_visit_evidence_insert on field_visit_evidence
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and exists (
      select 1 from field_visits v
      where v.id = field_visit_evidence.field_visit_id
        and v.employee_id = my_employee_id()
    )
  );

grant select on tasks, task_assignees, task_target_locations, task_comments,
                task_attachments, task_activity, field_visits,
                field_visit_evidence
  to authenticated;
grant insert, update on tasks to authenticated;
grant insert, update, delete on task_assignees to authenticated;
grant insert, update, delete on task_target_locations to authenticated;
grant insert on task_comments, task_attachments, field_visit_evidence to authenticated;
