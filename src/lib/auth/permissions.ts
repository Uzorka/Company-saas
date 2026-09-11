/**
 * The permission vocabulary, mirroring supabase/migrations/0006_permission_catalogue.sql.
 *
 * Typed so a typo in a permission check is a compile error rather than a
 * silent `false` that quietly denies — or, worse, a silent `true` if someone
 * inverts the test.
 */
export const PERMISSIONS = [
  "organization.view",
  "organization.manage",

  "employees.view_all",
  "employees.view_department",
  "employees.view_self",
  "employees.create",
  "employees.update",
  "employees.archive",
  "employees.documents.manage",

  "departments.view",
  "departments.manage",
  "departments.members.manage",

  "attendance.view_all",
  "attendance.view_department",
  "attendance.view_self",
  "attendance.check_in",
  "attendance.review",
  "attendance.manage_locations",

  "tasks.view_all",
  "tasks.view_department",
  "tasks.view_assigned",
  "tasks.create",
  "tasks.assign_any",
  "tasks.assign_department",
  "tasks.update_any",
  "tasks.update_assigned",
  "tasks.comment",
  "tasks.verify_visit",

  "leave.view_all",
  "leave.view_department",
  "leave.view_self",
  "leave.request",
  "leave.approve_department",
  "leave.approve_hr",
  "leave.manage_policy",

  "payroll.view_all",
  "payroll.view_self",
  "payroll.manage_components",
  "payroll.create",
  "payroll.process",
  "payroll.approve",
  "payroll.publish",
  "payroll.reports",

  "recruitment.view",
  "recruitment.manage_jobs",
  "recruitment.manage_applications",
  "recruitment.move_pipeline",
  "recruitment.convert_employee",

  "documents.view",
  "documents.manage",

  "reports.management",
  "reports.hr",
  "reports.payroll",
  "reports.department",

  "roles.view",
  "roles.manage",
  "permissions.manage",
  "settings.manage",
  "settings.manage_structure",
  "settings.manage_payroll",

  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_SLUGS = [
  "management",
  "hr",
  "accounts",
  "hod",
  "employee",
] as const;

export type Role = (typeof ROLE_SLUGS)[number];

/** Human labels for the permission state — "only X and Y can open this". */
export const ROLE_LABELS: Record<Role, string> = {
  management: "Management",
  hr: "HR",
  accounts: "Accounts",
  hod: "Heads of Department",
  employee: "Employees",
};

/**
 * Which roles can open a module, for the permission screen's copy. This is
 * presentation only — never an authorisation decision. Authority comes from
 * the permission set on the session, and ultimately from RLS.
 */
export const MODULE_ROLES: Record<string, Role[]> = {
  Employees: ["management", "hr", "hod"],
  Departments: ["management", "hr", "hod"],
  Attendance: ["management", "hr", "hod"],
  Tasks: ["management", "hod"],
  Leave: ["management", "hr", "hod"],
  Payroll: ["management", "accounts"],
  Recruitment: ["management", "hr"],
  Documents: ["management", "hr"],
  Reports: ["management", "hr", "accounts", "hod"],
  Settings: ["management"],
  Audit: ["management"],
};
