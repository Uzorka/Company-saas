import type { LucideIcon } from "lucide-react";
import type { Permission } from "@/lib/auth/permissions";
import {
  LayoutDashboard,
  Users,
  Building2,
  CalendarCheck,
  ClipboardList,
  Plane,
  Wallet,
  UserPlus,
  BarChart3,
  ShieldCheck,
  Settings,
  Receipt,
  Folder,
  Bell,
  MapPin,
} from "lucide-react";

/**
 * Role-filtered navigation. Source: Phase 3 - Auth and App Shell, const NAV.
 *
 * "Restricted, not hidden": an item a role cannot open still appears, with a
 * lock glyph and muted ink, and clicking it shows the permission state rather
 * than a 404. Each role's list below is the set they can *open*; everything
 * else in the module list renders locked.
 */
export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission slug required to open it. Absent means always open. */
  permission?: Permission;
  /**
   * False when the screen does not exist yet.
   *
   * These items stay in the list — the module is real, planned and part of the
   * brief — but they are rendered as text with a "Soon" marker rather than as
   * links, and the command palette will not offer them. A nav item that 404s
   * is worse than one that admits it is not built.
   */
  built: boolean;
};

export type RoleSlug =
  | "management"
  | "hr"
  | "accounts"
  | "hod"
  | "employee";

const item = (
  label: string,
  href: string,
  icon: LucideIcon,
  permission?: Permission,
): NavItem => ({ label, href, icon, permission, built: true });

/** A module from the brief whose screen has not been built yet. */
const planned = (
  label: string,
  href: string,
  icon: LucideIcon,
  permission?: Permission,
): NavItem => ({ label, href, icon, permission, built: false });

export const navByRole: Record<RoleSlug, NavItem[]> = {
  management: [
    item("Dashboard", "/dashboard", LayoutDashboard),
    item("Employees", "/employees", Users, "employees.view_all"),
    item("Departments", "/departments", Building2, "departments.view"),
    item("Attendance", "/attendance", CalendarCheck, "attendance.view_all"),
    item("Tasks", "/tasks", ClipboardList, "tasks.view_all"),
    item("Leave", "/leave", Plane, "leave.view_all"),
    item("Payroll", "/payroll", Wallet, "payroll.view_all"),
    item("Recruitment", "/recruitment", UserPlus, "recruitment.view"),
    planned("Reports", "/reports", BarChart3, "reports.management"),
    planned("Audit", "/audit", ShieldCheck, "audit.view"),
    planned("Settings", "/settings", Settings, "settings.manage"),
  ],
  hr: [
    item("Dashboard", "/dashboard", LayoutDashboard),
    item("Employees", "/employees", Users, "employees.view_all"),
    item("Departments", "/departments", Building2, "departments.view"),
    item("Attendance", "/attendance", CalendarCheck, "attendance.view_all"),
    item("Leave", "/leave", Plane, "leave.view_all"),
    item("Recruitment", "/recruitment", UserPlus, "recruitment.view"),
    planned("Documents", "/documents", Folder, "documents.view"),
    planned("Reports", "/reports", BarChart3, "reports.hr"),
    planned("Settings", "/settings", Settings),
  ],
  accounts: [
    item("Dashboard", "/dashboard", LayoutDashboard),
    item("Payroll", "/payroll", Wallet, "payroll.view_all"),
    item("Payslips", "/payslips", Receipt, "payroll.view_all"),
    item("Employees", "/employees", Users, "employees.view_all"),
    planned("Reports", "/reports", BarChart3, "reports.payroll"),
    planned("Settings", "/settings", Settings),
  ],
  hod: [
    item("Dashboard", "/dashboard", LayoutDashboard),
    item("My department", "/departments", Users, "departments.view"),
    item("Attendance", "/attendance", CalendarCheck, "attendance.view_department"),
    item("Tasks", "/tasks", ClipboardList, "tasks.view_department"),
    item("Field visits", "/tasks/visits", MapPin, "tasks.verify_visit"),
    item("Leave", "/leave", Plane, "leave.approve_department"),
    planned("Reports", "/reports", BarChart3, "reports.department"),
  ],
  employee: [
    item("Dashboard", "/dashboard", LayoutDashboard),
    item("Check in", "/attendance/check-in", CalendarCheck, "attendance.check_in"),
    item("My tasks", "/tasks", ClipboardList, "tasks.view_assigned"),
    item("Leave", "/leave", Plane, "leave.view_self"),
    item("Payslips", "/payslips", Receipt, "payroll.view_self"),
    planned("Documents", "/documents", Folder, "documents.view"),
    planned("Notifications", "/notifications", Bell),
  ],
};

/**
 * Mobile bottom nav: four items maximum. Everything else lives behind More.
 * The sidebar does not exist under 640px, and a hamburger drawer that
 * recreates it is explicitly ruled out by the design.
 */
export const mobileNav: NavItem[] = [
  item("Home", "/dashboard", LayoutDashboard),
  item("Attendance", "/attendance", CalendarCheck),
  item("Tasks", "/tasks", ClipboardList),
];

/**
 * Which navigation layout to show when a user holds more than one role.
 *
 * Permissions are always the union — this only picks a nav layout, never what
 * the user may do. Ordered most to least privileged, so someone who is both an
 * HOD and an employee gets the fuller navigation, not the narrower one.
 */
const ROLE_PRECEDENCE: RoleSlug[] = [
  "management",
  "hr",
  "accounts",
  "hod",
  "employee",
];

export function pickPrimaryRole(roles: readonly string[]): RoleSlug {
  for (const candidate of ROLE_PRECEDENCE) {
    if (roles.includes(candidate)) return candidate;
  }
  return "employee";
}
