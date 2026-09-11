-- 0005_rls
--
-- Row Level Security for everything created so far.
--
-- Principles, from docs/PHASE_0_PLAN.md section 0.8:
--
--  * Default deny. RLS is enabled on every table and each one gets explicit
--    per-command policies. There is no `authenticated = true` policy on any
--    sensitive table — a test in this phase asserts that.
--  * Organization isolation is the outermost gate: current_org_id() comes from
--    a signed JWT claim the client cannot set.
--  * Policies test permissions, never role names.
--  * RLS is one of two independent layers. Server actions re-check permission
--    with validated input; neither layer substitutes for the other.

alter table organizations          enable row level security;
alter table organization_settings  enable row level security;
alter table offices                enable row level security;
alter table platform_admins        enable row level security;
alter table profiles               enable row level security;
alter table organization_members   enable row level security;
alter table roles                  enable row level security;
alter table role_permissions       enable row level security;
alter table user_roles             enable row level security;
alter table role_grant_requests    enable row level security;
alter table permissions            enable row level security;
alter table audit_logs             enable row level security;

-- Force RLS for table owners too, so a definer function or a superuser-owned
-- connection cannot quietly read across tenants.
alter table organizations         force row level security;
alter table organization_settings force row level security;
alter table offices               force row level security;
alter table organization_members  force row level security;
alter table roles                 force row level security;
alter table user_roles            force row level security;
alter table role_grant_requests   force row level security;
alter table audit_logs            force row level security;


-- ---------------------------------------------------------------------------
-- organizations — a member sees their own tenant, and only that one.
-- ---------------------------------------------------------------------------
create policy organizations_select_own on organizations
  for select to authenticated
  using (id = current_org_id());

create policy organizations_update_managed on organizations
  for update to authenticated
  using (id = current_org_id() and has_permission('organization.manage'))
  with check (id = current_org_id() and has_permission('organization.manage'));


-- ---------------------------------------------------------------------------
-- organization_settings — readable by any member, writable with settings.manage.
-- ---------------------------------------------------------------------------
create policy org_settings_select on organization_settings
  for select to authenticated
  using (organization_id = current_org_id());

-- Any of the three settings scopes may write here: Management holds full
-- access, HR its structure area, Accounts its payroll area. Which columns each
-- may touch is enforced in the server action, since column-level policies
-- would duplicate the permission vocabulary in SQL.
create policy org_settings_update on organization_settings
  for update to authenticated
  using (
    organization_id = current_org_id()
    and (
      has_permission('settings.manage')
      or has_permission('settings.manage_structure')
      or has_permission('settings.manage_payroll')
    )
  )
  with check (
    organization_id = current_org_id()
    and (
      has_permission('settings.manage')
      or has_permission('settings.manage_structure')
      or has_permission('settings.manage_payroll')
    )
  );


-- ---------------------------------------------------------------------------
-- offices — every member needs to read these to check in; only
-- attendance.manage_locations may change them.
-- ---------------------------------------------------------------------------
create policy offices_select on offices
  for select to authenticated
  using (organization_id = current_org_id());

create policy offices_insert on offices
  for insert to authenticated
  with check (organization_id = current_org_id() and has_permission('attendance.manage_locations'));

create policy offices_update on offices
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('attendance.manage_locations'))
  with check (organization_id = current_org_id() and has_permission('attendance.manage_locations'));

-- No delete policy: offices are deactivated, not deleted. Attendance records
-- reference them and nothing in this product is destroyed.


-- ---------------------------------------------------------------------------
-- profiles — your own, plus anyone who shares your organization. A directory
-- that cannot resolve a name is not a directory.
-- ---------------------------------------------------------------------------
create policy profiles_select_self on profiles
  for select to authenticated
  using (id = auth.uid());

create policy profiles_select_same_org on profiles
  for select to authenticated
  using (
    exists (
      select 1
      from organization_members m
      where m.user_id = profiles.id
        and m.organization_id = current_org_id()
    )
  );

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());


-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------

-- Deliberately not scoped to current_org_id(): the workspace picker at
-- /auth/workspace must list the caller's memberships *before* an organization
-- is chosen, when no org claim exists yet. Restricted to their own rows.
create policy members_select_self on organization_members
  for select to authenticated
  using (user_id = auth.uid());

create policy members_select_org on organization_members
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('employees.view_all'));

create policy members_manage on organization_members
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('roles.manage'))
  with check (organization_id = current_org_id() and has_permission('roles.manage'));


-- ---------------------------------------------------------------------------
-- permissions — the shared vocabulary. Readable by any signed-in user so the
-- roles screen can render the matrix; writable by nobody through the API.
-- ---------------------------------------------------------------------------
create policy permissions_select on permissions
  for select to authenticated
  using (true);


-- ---------------------------------------------------------------------------
-- roles and role_permissions
-- ---------------------------------------------------------------------------
create policy roles_select on roles
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('roles.view'));

create policy roles_manage on roles
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('roles.manage'))
  with check (organization_id = current_org_id() and has_permission('roles.manage'));

create policy role_permissions_select on role_permissions
  for select to authenticated
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and r.organization_id = current_org_id()
        and has_permission('roles.view')
    )
  );

create policy role_permissions_manage on role_permissions
  for all to authenticated
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and r.organization_id = current_org_id()
        and has_permission('permissions.manage')
    )
  )
  with check (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and r.organization_id = current_org_id()
        and has_permission('permissions.manage')
    )
  );


-- ---------------------------------------------------------------------------
-- user_roles — you may always see your own; seeing everyone's needs roles.view.
-- ---------------------------------------------------------------------------
create policy user_roles_select_self on user_roles
  for select to authenticated
  using (user_id = auth.uid() and organization_id = current_org_id());

create policy user_roles_select_org on user_roles
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('roles.view'));

create policy user_roles_manage on user_roles
  for all to authenticated
  using (organization_id = current_org_id() and has_permission('roles.manage'))
  with check (organization_id = current_org_id() and has_permission('roles.manage'));


-- ---------------------------------------------------------------------------
-- role_grant_requests — no delete policy anywhere: a declined or revoked
-- grant stays visible. A revocation is a new row, never an edit.
-- ---------------------------------------------------------------------------
create policy role_grants_select on role_grant_requests
  for select to authenticated
  using (
    organization_id = current_org_id()
    and (has_permission('roles.view') or target_user_id = auth.uid())
  );

create policy role_grants_insert on role_grant_requests
  for insert to authenticated
  with check (
    organization_id = current_org_id()
    and has_permission('roles.manage')
    and requested_by = auth.uid()
  );

create policy role_grants_update on role_grant_requests
  for update to authenticated
  using (organization_id = current_org_id() and has_permission('roles.manage'))
  with check (organization_id = current_org_id() and has_permission('roles.manage'));


-- ---------------------------------------------------------------------------
-- audit_logs — read with audit.view, within your tenant. There is deliberately
-- NO insert policy: entries are written only through write_audit(), which is
-- security definer and takes the organization from the caller's claim, so no
-- client can forge an entry. Update and delete are impossible by construction.
-- ---------------------------------------------------------------------------
create policy audit_select on audit_logs
  for select to authenticated
  using (organization_id = current_org_id() and has_permission('audit.view'));


-- ---------------------------------------------------------------------------
-- platform_admins — visible only to yourself. Note that being a platform admin
-- grants no access to any tenant-owned row: there is no cross-tenant policy
-- anywhere in this file, by design.
-- ---------------------------------------------------------------------------
create policy platform_admins_select_self on platform_admins
  for select to authenticated
  using (user_id = auth.uid());


-- Table privileges. RLS narrows what a role can see; grants decide whether it
-- can attempt the command at all. Both are needed.
grant select on organizations, organization_settings, offices, profiles,
                organization_members, permissions, roles, role_permissions,
                user_roles, role_grant_requests, audit_logs
  to authenticated;

grant insert, update on organizations, organization_settings, offices, profiles,
                         organization_members, roles, role_permissions,
                         user_roles, role_grant_requests
  to authenticated;

grant delete on role_permissions, user_roles, organization_members to authenticated;
