import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Permission } from "@/lib/auth/permissions";

/**
 * What can be exported, and by whom.
 *
 * TWO RULES, BOTH STRUCTURAL
 *
 * An export returns exactly what the caller can already see on screen, because
 * it runs the same query through the same client: RLS decides the rows, so an
 * HOD exporting the directory gets their department and an employee gets
 * themselves. There is no `where` clause here to forget, and no admin client
 * anywhere near this file — an export that quietly widened a person's access
 * would be the single worst bug this product could ship.
 *
 * Every export is audited. A CSV of everyone's attendance leaves the building
 * on a laptop, and "who took a copy of this, and when" is exactly the question
 * an audit log exists to answer.
 */

export type Dataset = {
  /** The permission needed to ask for it at all. */
  permission: Permission;
  /** Shown on the button and in the filename. */
  label: string;
  /** Rows, already scoped by RLS. */
  fetch: () => Promise<Record<string, unknown>[]>;
  columns: { header: string; value: (row: never) => unknown }[];
};

type Row = Record<string, unknown>;

/** `a.b` on a possibly-absent embed, without a cast at every call site. */
const path = (row: Row, ...keys: string[]): unknown => {
  let current: unknown = row;
  for (const key of keys) {
    if (current === null || typeof current !== "object") return null;
    current = (current as Row)[key];
  }
  return current ?? null;
};

async function selectFrom(
  table: string,
  select: string,
  order?: { column: string; ascending?: boolean },
): Promise<Row[]> {
  const supabase = await createClient();
  let query = supabase.from(table).select(select);
  if (order) query = query.order(order.column, { ascending: order.ascending ?? true });
  const { data, error } = await query.limit(5000);
  if (error) {
    console.error(`export: ${table} query failed`, error.message, error.code);
    throw new Error("export-query-failed");
  }
  return (data ?? []) as unknown as Row[];
}

export const DATASETS: Record<string, Dataset> = {
  employees: {
    permission: "employees.view_self",
    label: "Employees",
    fetch: () =>
      selectFrom(
        "employees",
        `employee_no, first_name, last_name, work_email, phone, location,
         employment_type, employment_status, hire_date, exit_date,
         department:departments(name), position:positions(title)`,
        { column: "last_name" },
      ),
    columns: [
      { header: "Employee number", value: (r: Row) => r.employee_no },
      { header: "First name", value: (r: Row) => r.first_name },
      { header: "Last name", value: (r: Row) => r.last_name },
      { header: "Department", value: (r: Row) => path(r, "department", "name") },
      { header: "Position", value: (r: Row) => path(r, "position", "title") },
      { header: "Employment type", value: (r: Row) => r.employment_type },
      { header: "Status", value: (r: Row) => r.employment_status },
      { header: "Start date", value: (r: Row) => r.hire_date },
      { header: "Exit date", value: (r: Row) => r.exit_date },
      { header: "Work email", value: (r: Row) => r.work_email },
      { header: "Phone", value: (r: Row) => r.phone },
      { header: "Location", value: (r: Row) => r.location },
    ],
  },

  attendance: {
    permission: "attendance.view_self",
    label: "Attendance",
    fetch: () =>
      selectFrom(
        "attendance_records",
        `work_date, check_in_at, check_out_at, attendance_type, state,
         review_state, late_by_minutes, check_in_distance_m,
         check_in_accuracy_m, exception_codes,
         employee:employees(employee_no, first_name, last_name)`,
        { column: "work_date", ascending: false },
      ),
    columns: [
      { header: "Date", value: (r: Row) => r.work_date },
      { header: "Employee number", value: (r: Row) => path(r, "employee", "employee_no") },
      {
        header: "Name",
        value: (r: Row) =>
          `${path(r, "employee", "first_name") ?? ""} ${path(r, "employee", "last_name") ?? ""}`.trim(),
      },
      { header: "Checked in", value: (r: Row) => r.check_in_at },
      { header: "Checked out", value: (r: Row) => r.check_out_at },
      { header: "Type", value: (r: Row) => r.attendance_type },
      { header: "State", value: (r: Row) => r.state },
      { header: "Review", value: (r: Row) => r.review_state },
      { header: "Late by (minutes)", value: (r: Row) => r.late_by_minutes },
      { header: "Distance from office (m)", value: (r: Row) => r.check_in_distance_m },
      { header: "Position accuracy (m)", value: (r: Row) => r.check_in_accuracy_m },
      {
        header: "Exceptions",
        value: (r: Row) =>
          Array.isArray(r.exception_codes) ? r.exception_codes.join(" ") : "",
      },
    ],
  },

  tasks: {
    permission: "tasks.view_assigned",
    label: "Tasks",
    fetch: () =>
      selectFrom(
        "tasks",
        `reference, title, status, priority, verification_mode, start_date,
         due_date, completed_at, department:departments(name)`,
        { column: "due_date" },
      ),
    columns: [
      { header: "Reference", value: (r: Row) => r.reference },
      { header: "Title", value: (r: Row) => r.title },
      { header: "Department", value: (r: Row) => path(r, "department", "name") },
      { header: "Status", value: (r: Row) => r.status },
      { header: "Priority", value: (r: Row) => r.priority },
      { header: "Proof required", value: (r: Row) => r.verification_mode },
      { header: "Start date", value: (r: Row) => r.start_date },
      { header: "Due date", value: (r: Row) => r.due_date },
      { header: "Completed", value: (r: Row) => r.completed_at },
    ],
  },

  leave: {
    permission: "leave.view_self",
    label: "Leave requests",
    fetch: () =>
      selectFrom(
        "leave_requests",
        `starts_on, ends_on, days_requested, status, reason, submitted_at,
         decided_at, leave_type:leave_types(name),
         employee:employees(employee_no, first_name, last_name)`,
        { column: "starts_on", ascending: false },
      ),
    columns: [
      { header: "Employee number", value: (r: Row) => path(r, "employee", "employee_no") },
      {
        header: "Name",
        value: (r: Row) =>
          `${path(r, "employee", "first_name") ?? ""} ${path(r, "employee", "last_name") ?? ""}`.trim(),
      },
      { header: "Type", value: (r: Row) => path(r, "leave_type", "name") },
      { header: "From", value: (r: Row) => r.starts_on },
      { header: "To", value: (r: Row) => r.ends_on },
      { header: "Working days", value: (r: Row) => r.days_requested },
      { header: "Status", value: (r: Row) => r.status },
      { header: "Reason", value: (r: Row) => r.reason },
      { header: "Submitted", value: (r: Row) => r.submitted_at },
      { header: "Decided", value: (r: Row) => r.decided_at },
    ],
  },

  payroll: {
    // Pay figures, so the payroll permission and nothing weaker. HR reaches
    // this route and gets nothing, which is the same answer the screen gives.
    permission: "payroll.view_all",
    label: "Payroll lines",
    fetch: () =>
      selectFrom(
        "payroll_run_lines",
        `employee_no, employee_name, department_name, basic_salary, gross_pay,
         paye, pension_employee, nhf, other_deductions, total_deductions,
         net_pay, currency_code, period:payroll_periods(label, status)`,
        { column: "employee_name" },
      ),
    columns: [
      { header: "Period", value: (r: Row) => path(r, "period", "label") },
      { header: "Period status", value: (r: Row) => path(r, "period", "status") },
      { header: "Employee number", value: (r: Row) => r.employee_no },
      { header: "Name", value: (r: Row) => r.employee_name },
      { header: "Department", value: (r: Row) => r.department_name },
      { header: "Currency", value: (r: Row) => r.currency_code },
      { header: "Basic", value: (r: Row) => r.basic_salary },
      { header: "Gross", value: (r: Row) => r.gross_pay },
      { header: "PAYE", value: (r: Row) => r.paye },
      { header: "Pension", value: (r: Row) => r.pension_employee },
      { header: "NHF", value: (r: Row) => r.nhf },
      { header: "Other deductions", value: (r: Row) => r.other_deductions },
      { header: "Total deductions", value: (r: Row) => r.total_deductions },
      { header: "Net pay", value: (r: Row) => r.net_pay },
    ],
  },

  applicants: {
    permission: "recruitment.view",
    label: "Applicants",
    fetch: () =>
      selectFrom(
        "job_applications",
        `first_name, last_name, email, phone, location, stage, source,
         created_at, on_hold_at, interview_at, interview_location,
         job:jobs(title)`,
        { column: "created_at", ascending: false },
      ),
    columns: [
      { header: "First name", value: (r: Row) => r.first_name },
      { header: "Last name", value: (r: Row) => r.last_name },
      { header: "Role", value: (r: Row) => path(r, "job", "title") },
      { header: "Stage", value: (r: Row) => r.stage },
      { header: "On hold since", value: (r: Row) => r.on_hold_at },
      { header: "Interview", value: (r: Row) => r.interview_at },
      { header: "Interview location", value: (r: Row) => r.interview_location },
      { header: "Email", value: (r: Row) => r.email },
      { header: "Phone", value: (r: Row) => r.phone },
      { header: "Location", value: (r: Row) => r.location },
      { header: "Source", value: (r: Row) => r.source },
      { header: "Applied", value: (r: Row) => r.created_at },
    ],
  },

  departments: {
    permission: "departments.view",
    label: "Departments",
    fetch: () => selectFrom("departments", "code, name, description, active", { column: "name" }),
    columns: [
      { header: "Code", value: (r: Row) => r.code },
      { header: "Name", value: (r: Row) => r.name },
      { header: "Description", value: (r: Row) => r.description },
      { header: "Active", value: (r: Row) => (r.active ? "yes" : "no") },
    ],
  },

  audit: {
    permission: "audit.view",
    label: "Audit log",
    fetch: () =>
      selectFrom(
        "audit_logs",
        "created_at, action, entity_type, entity_id, actor_user_id, metadata",
        { column: "created_at", ascending: false },
      ),
    columns: [
      { header: "When", value: (r: Row) => r.created_at },
      { header: "Action", value: (r: Row) => r.action },
      { header: "Entity", value: (r: Row) => r.entity_type },
      { header: "Entity id", value: (r: Row) => r.entity_id },
      { header: "Actor", value: (r: Row) => r.actor_user_id },
      { header: "Detail", value: (r: Row) => JSON.stringify(r.metadata ?? {}) },
    ],
  },
};

export type DatasetName = keyof typeof DATASETS;
