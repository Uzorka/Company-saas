-- 0006_permission_catalogue
--
-- The permission vocabulary from docs/PERMISSIONS.md, and the function that
-- provisions an organization's five default roles.
--
-- Six scopes, not five. `view_self` / `own only` is a DIFFERENT scope, not a
-- weaker `read`: an Employee sees their own payslip inside a module they
-- otherwise have no access to at all.

insert into permissions (slug, module, description) values
  ('organization.view',            'Organization', 'See the organization profile'),
  ('organization.manage',          'Organization', 'Change the organization profile'),

  ('employees.view_all',           'Employees',    'See every employee in the organization'),
  ('employees.view_department',    'Employees',    'See employees in departments the user heads'),
  ('employees.view_self',          'Employees',    'See their own employee record'),
  ('employees.create',             'Employees',    'Create an employee record'),
  ('employees.update',             'Employees',    'Change an employee record'),
  ('employees.archive',            'Employees',    'Deactivate an employee — never delete'),
  ('employees.documents.manage',   'Employees',    'Manage documents on an employee file'),

  ('departments.view',             'Departments',  'See departments'),
  ('departments.manage',           'Departments',  'Create and change departments'),
  ('departments.members.manage',   'Departments',  'Move people between departments'),

  ('attendance.view_all',          'Attendance',   'See attendance for the whole organization'),
  ('attendance.view_department',   'Attendance',   'See attendance for departments the user heads'),
  ('attendance.view_self',         'Attendance',   'See their own attendance'),
  ('attendance.check_in',          'Attendance',   'Check in and out for themselves'),
  ('attendance.review',            'Attendance',   'Review, flag and correct attendance records'),
  ('attendance.manage_locations',  'Attendance',   'Manage offices and geofence radii'),

  ('tasks.view_all',               'Tasks',        'See every task'),
  ('tasks.view_department',        'Tasks',        'See tasks in departments the user heads'),
  ('tasks.view_assigned',          'Tasks',        'See tasks assigned to them'),
  ('tasks.create',                 'Tasks',        'Create tasks'),
  ('tasks.assign_any',             'Tasks',        'Assign a task to anyone'),
  ('tasks.assign_department',      'Tasks',        'Assign a task within their department'),
  ('tasks.update_any',             'Tasks',        'Change any task'),
  ('tasks.update_assigned',        'Tasks',        'Change tasks assigned to them'),
  ('tasks.comment',                'Tasks',        'Comment on a task'),
  ('tasks.verify_visit',           'Tasks',        'Accept or return field-visit evidence'),

  ('leave.view_all',               'Leave',        'See every leave request'),
  ('leave.view_department',        'Leave',        'See leave for departments the user heads'),
  ('leave.view_self',              'Leave',        'See their own leave'),
  ('leave.request',                'Leave',        'Request leave'),
  ('leave.approve_department',     'Leave',        'Approve leave as head of department'),
  ('leave.approve_hr',             'Leave',        'Give final HR approval'),
  ('leave.manage_policy',          'Leave',        'Manage leave types and policies'),

  ('payroll.view_all',             'Payroll',      'See payroll for every employee'),
  ('payroll.view_self',            'Payroll',      'See their own payslips'),
  ('payroll.manage_components',    'Payroll',      'Manage salary components'),
  ('payroll.create',               'Payroll',      'Create a payroll period'),
  ('payroll.process',              'Payroll',      'Advance a run through processing'),
  ('payroll.approve',              'Payroll',      'Approve a run — never one Accounts submitted'),
  ('payroll.publish',              'Payroll',      'Publish payslips — irreversible'),
  ('payroll.reports',              'Payroll',      'See payroll reports'),

  ('recruitment.view',             'Recruitment',  'See jobs and applicants'),
  ('recruitment.manage_jobs',      'Recruitment',  'Publish and unpublish jobs'),
  ('recruitment.manage_applications','Recruitment','Manage applications'),
  ('recruitment.move_pipeline',    'Recruitment',  'Move an applicant between stages'),
  ('recruitment.convert_employee', 'Recruitment',  'Convert an applicant to an employee'),

  ('documents.view',               'Documents',    'See documents allowed by their sensitivity'),
  ('documents.manage',             'Documents',    'Upload, replace and reclassify documents'),

  ('reports.management',           'Reports',      'Organisation-wide reports'),
  ('reports.hr',                   'Reports',      'People reports'),
  ('reports.payroll',              'Reports',      'Payroll reports'),
  ('reports.department',           'Reports',      'Reports scoped to their department'),

  ('roles.view',                   'Settings',     'See roles and the permission matrix'),
  ('roles.manage',                 'Settings',     'Assign and revoke roles'),
  ('permissions.manage',           'Settings',     'Change what a role may do'),
  ('settings.manage',              'Settings',     'Change any company setting — full access'),
  -- The design's "Some areas" scope: by subject, not department.
  ('settings.manage_structure',     'Settings',     'Departments and leave types — HR''s area'),
  ('settings.manage_payroll',       'Settings',     'Payroll rates and statutory settings — Accounts'' area'),

  ('audit.view',                   'Audit',        'Read the audit log');


-- Provision the five default roles for an organization.
--
-- The grants below are the design's 10x5 matrix, read across each role's row.
-- Two of them are load-bearing and easy to get wrong later:
--   * HR has NO payroll permissions at all.
--   * Accounts has NO recruitment, leave-approval or HR permissions.
-- Neither inherits the other's access.
create or replace function provision_default_roles(p_organization_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  new_role_id uuid;
begin
  for r in
    select * from (values
      ('management', 'Management', 'Full visibility across the organisation, including payroll figures and the audit log.', true),
      ('hr',         'HR',         'Owns people data, hiring and documents. Cannot see payroll figures.', true),
      ('accounts',   'Accounts',   'Runs payroll and publishes payslips. Sees salary for every employee.', true),
      ('hod',        'Head of Department', 'Runs a department: its people, tasks, attendance and leave.', false),
      ('employee',   'Employee',   'Their own record, tasks, leave and payslips.', false)
    ) as t(slug, name, description, high_risk)
  loop
    insert into roles (organization_id, slug, name, description, high_risk, is_system)
    values (p_organization_id, r.slug, r.name, r.description, r.high_risk, true)
    on conflict (organization_id, slug) do update set name = excluded.name
    returning id into new_role_id;

    delete from role_permissions where role_id = new_role_id;

    insert into role_permissions (role_id, permission_slug)
    select new_role_id, slug from permissions where
      case r.slug
        -- Management is Full on every module in the matrix, and Read on
        -- Audit — which audit.view already is, since no role may write it.
        -- They are also employees, so they keep the self-scoped permissions.
        when 'management' then true

        when 'hr' then
          module in ('Employees', 'Departments', 'Attendance', 'Recruitment', 'Documents')
          or slug in (
            'organization.view',
            'leave.view_all', 'leave.view_self', 'leave.request',
            'leave.approve_hr', 'leave.manage_policy',
            'tasks.view_all', 'tasks.view_assigned', 'tasks.comment',
            'reports.hr', 'roles.view', 'attendance.check_in',
            'settings.manage_structure'
          )

        when 'accounts' then
          module = 'Payroll'
          or slug in (
            'organization.view',
            'employees.view_all', 'employees.view_self',
            'attendance.view_all', 'attendance.view_self', 'attendance.check_in',
            'leave.view_all', 'leave.view_self', 'leave.request',
            'departments.view', 'documents.view',
            'reports.payroll', 'settings.manage_payroll'
          )

        when 'hod' then
          slug in (
            'organization.view',
            'employees.view_department', 'employees.view_self',
            'departments.view',
            'attendance.view_department', 'attendance.view_self', 'attendance.check_in',
            'tasks.view_department', 'tasks.view_assigned', 'tasks.create',
            'tasks.assign_department', 'tasks.update_any', 'tasks.update_assigned',
            'tasks.comment', 'tasks.verify_visit',
            'leave.view_department', 'leave.view_self', 'leave.request',
            'leave.approve_department',
            'documents.view', 'reports.department',
            'recruitment.view'
          )

        else -- employee
          slug in (
            'organization.view',
            'employees.view_self',
            'attendance.view_self', 'attendance.check_in',
            'tasks.view_assigned', 'tasks.update_assigned', 'tasks.comment',
            'leave.view_self', 'leave.request',
            'payroll.view_self',
            'documents.view'
          )
      end;
  end loop;
end;
$$;
