import type { LucideIcon } from "lucide-react";
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
  permission?: string;
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
  permission?: string,
): NavItem => ({ label, href, icon, permission });

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
    item("Reports", "/reports", BarChart3, "reports.management"),
    item("Audit", "/audit", ShieldCheck, "audit.view"),
    item("Settings", "/settings", Settings, "settings.manage"),
  ],
  hr: [
    item("Dashboard", "/dashboard", LayoutDashboard),
    item("Employees", "/employees", Users, "employees.view_all"),
    item("Departments", "/departments", Building2, "departments.view"),
    item("Attendance", "/attendance", CalendarCheck, "attendance.view_all"),
    item("Leave", "/leave", Plane, "leave.view_all"),
    item("Recruitment", "/recruitment", UserPlus, "recruitment.view"),
    item("Documents", "/documents", Folder, "documents.view"),
    item("Reports", "/reports", BarChart3, "reports.hr"),
    item("Settings", "/settings", Settings),
  ],
  accounts: [
    item("Dashboard", "/dashboard", LayoutDashboard),
    item("Payroll", "/payroll", Wallet, "payroll.view_all"),
    item("Payslips", "/payslips", Receipt, "payroll.view_all"),
    item("Employees", "/employees", Users, "employees.view_all"),
    item("Reports", "/reports", BarChart3, "reports.payroll"),
    item("Settings", "/settings", Settings),
  ],
  hod: [
    item("Dashboard", "/dashboard", LayoutDashboard),
    item("My department", "/departments", Users, "departments.view"),
    item("Attendance", "/attendance", CalendarCheck, "attendance.view_department"),
    item("Tasks", "/tasks", ClipboardList, "tasks.view_department"),
    item("Field visits", "/tasks?view=visits", MapPin, "tasks.verify_visit"),
    item("Leave", "/leave", Plane, "leave.approve_department"),
    item("Reports", "/reports", BarChart3, "reports.department"),
  ],
  employee: [
    item("Dashboard", "/dashboard", LayoutDashboard),
    item("Check in", "/attendance/check-in", CalendarCheck, "attendance.check_in"),
    item("My tasks", "/tasks", ClipboardList, "tasks.view_assigned"),
    item("Leave", "/leave", Plane, "leave.view_self"),
    item("Payslips", "/payslips", Receipt, "payroll.view_self"),
    item("Documents", "/documents", Folder, "documents.view"),
    item("Notifications", "/notifications", Bell),
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
