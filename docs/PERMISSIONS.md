# Permissions

## Roles
`super_admin` (platform, not a tenant role) · `management` · `hr` · `accounts` · `hod` · `employee`

A user may hold more than one role. **Effective permissions are the union of every assigned role's permissions.** Scopes add; they never cancel.

## Scopes — six, not five
| Scope | Meaning |
|---|---|
| Full | Create, read, update, delete across the whole organisation |
| Approve | Read everything in the module and advance requests — not create or delete |
| Dept only | Everything the role can do, scoped to the department(s) the user heads |
| Some areas | Scoped **by subject, not department**. HR owns departments and leave types; Accounts owns payroll rates and statutory settings; neither can open the other's |
| Read | See everything in the module, change nothing |
| Own only | See and act on their own record and nothing else — a *different* scope, not a weaker Read. An Employee sees their own payslip inside a module they otherwise cannot open |
| None | No access. Nav item stays visible with a lock and shows the permission state — never a 404, never silently removed |

## Module matrix (approved design)
`▲` = carries salary, personal or audit data.

| Module | Management | HR | Accounts | HOD | Employee |
|---|---|---|---|---|---|
| Employees | Full | Full | Read | Dept only | None |
| Attendance | Full | Full | Read | Dept only | Own only |
| Tasks | Full | Read | None | Full | Own only |
| Leave | Approve | Approve | Read | Approve | Own only |
| ▲ Payroll | Full | None | Full | None | Own only |
| Recruitment | Full | Full | None | Dept only | None |
| ▲ Documents | Full | Full | Read | Dept only | Own only |
| Reports | Full | Read | Read | Dept only | None |
| ▲ Settings | Full | Some areas | Some areas | None | None |
| ▲ Audit | Read | None | None | None | None |

HR has **no** payroll access. Accounts has **no** HR access. Neither inherits the other.

## Permission slugs
Stored in `permissions`, granted through `role_permissions`, resolved into the JWT. Policies test permission slugs, never role names.

`organization.view` `organization.manage`
`employees.view_all` `employees.view_department` `employees.view_self` `employees.create` `employees.update` `employees.archive` `employees.documents.manage`
`departments.view` `departments.manage` `departments.members.manage`
`attendance.view_all` `attendance.view_department` `attendance.view_self` `attendance.check_in` `attendance.review` `attendance.manage_locations`
`tasks.view_all` `tasks.view_department` `tasks.view_assigned` `tasks.create` `tasks.assign_any` `tasks.assign_department` `tasks.update_any` `tasks.update_assigned` `tasks.comment` `tasks.verify_visit`
`leave.view_all` `leave.view_department` `leave.view_self` `leave.request` `leave.approve_department` `leave.approve_hr` `leave.manage_policy`
`payroll.view_all` `payroll.view_self` `payroll.manage_components` `payroll.create` `payroll.process` `payroll.approve` `payroll.publish` `payroll.reports`
`recruitment.view` `recruitment.manage_jobs` `recruitment.manage_applications` `recruitment.move_pipeline` `recruitment.convert_employee`
`documents.view` `documents.manage`
`reports.management` `reports.hr` `reports.payroll` `reports.department`
`roles.view` `roles.manage` `permissions.manage` `settings.manage` `audit.view`

## High-risk grants
Any grant touching **Payroll, Documents, Settings or Audit** requires a written reason **and a second approver** — HR seconds Accounts and Management grants. Modelled as `role_grant_requests` (Requested → Awaiting second approver → Active → Revoked). One person cannot complete such a grant. A revocation is a new entry, never an edit.

## Separation of duties
Accounts cannot approve a payroll run it submitted. Enforced in SQL, not only in the UI.

## Helper functions
`current_org_id()` · `has_permission(text)` · `heads_department(uuid)` · `is_self(uuid)` — `security definer`, pinned `search_path`, defined once in migration `003_rbac`. No policy reimplements this logic inline.
