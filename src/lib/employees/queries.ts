import "server-only";
import { createClient } from "@/lib/supabase/server";
import { buildEmployeeSearchFilter } from "./search";

/**
 * Employee reads.
 *
 * None of these filter by scope. That is deliberate: RLS decides what comes
 * back, so an HOD running the same query as HR gets their department and
 * nothing else, without a `where` clause anywhere in this file to forget.
 *
 * Salary is absent for the same reason — employee_compensation is a separate
 * table with its own policy, so a role without payroll access cannot pull it
 * in even by editing the select.
 */
export type EmployeeStatus =
  | "active"
  | "probation"
  | "leave"
  | "suspended"
  | "exited";

export type EmployeeRow = {
  id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  work_email: string | null;
  location: string | null;
  hire_date: string;
  employment_status: EmployeeStatus;
  employment_type: string;
  department: { id: string; name: string } | null;
  position: { id: string; title: string } | null;
};

const EMPLOYEE_SELECT = `
  id, employee_no, first_name, last_name, photo_url, work_email, location,
  hire_date, employment_status, employment_type,
  department:departments(id, name),
  position:positions(id, title)
`;

export type EmployeeFilters = {
  search?: string;
  departmentId?: string;
  status?: EmployeeStatus;
};

export async function listEmployees(
  filters: EmployeeFilters = {},
): Promise<{ rows: EmployeeRow[]; error: string | null }> {
  const supabase = await createClient();

  let query = supabase
    .from("employees")
    .select(EMPLOYEE_SELECT)
    .order("last_name", { ascending: true });

  if (filters.departmentId) {
    query = query.eq("department_id", filters.departmentId);
  }
  if (filters.status) {
    query = query.eq("employment_status", filters.status);
  }
  if (filters.search) {
    const searchFilter = buildEmployeeSearchFilter(filters.search);
    if (searchFilter) query = query.or(searchFilter);
  }

  const { data, error } = await query;

  if (error) {
    // Surfaced as the designed error state — cause named, data reassured,
    // retry offered — never a raw code or a stack trace.
    return { rows: [], error: error.message };
  }

  return { rows: (data ?? []) as unknown as EmployeeRow[], error: null };
}

export type DepartmentRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
};

export async function listDepartments(): Promise<{
  rows: DepartmentRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("departments")
    .select("id, code, name, description, active")
    .order("name");

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as DepartmentRow[], error: null };
}

/** Headcount per department, computed from what the caller may actually see. */
export async function departmentHeadcounts(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .select("department_id")
    .neq("employment_status", "exited");

  if (error || !data) return {};

  return data.reduce<Record<string, number>>((counts, row) => {
    const id = (row as { department_id: string | null }).department_id;
    if (id) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, {});
}

export type PositionRow = {
  id: string;
  title: string;
  grade: string | null;
  department_id: string | null;
  active: boolean;
};

/**
 * Positions, for the pickers on the employee and position forms.
 *
 * Inactive ones are excluded: they exist so historical records still resolve,
 * not so someone can be hired into a role that was retired.
 */
export async function listPositions(): Promise<{
  rows: PositionRow[];
  error: boolean;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("positions")
    .select("id, title, grade, department_id, active")
    .eq("active", true)
    .order("title");

  return { rows: (data ?? []) as PositionRow[], error: Boolean(error) };
}
