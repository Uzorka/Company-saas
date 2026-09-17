import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ApprovalRecord, LeaveStatus } from "./model";

export type LeaveRequestRow = {
  id: string;
  status: LeaveStatus;
  starts_on: string;
  ends_on: string;
  days_requested: number;
  reason: string | null;
  submitted_at: string | null;
  leave_type: { id: string; name: string; paid: boolean } | null;
  employee: { id: string; first_name: string; last_name: string } | null;
  approvals: ApprovalRecord[];
};

const REQUEST_SELECT = `
  id, status, starts_on, ends_on, days_requested, reason, submitted_at,
  leave_type:leave_types(id, name, paid),
  employee:employees(id, first_name, last_name),
  approvals:leave_approvals(stage, decision, note, decided_at)
`;

export async function listMyLeave(): Promise<{
  rows: LeaveRequestRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .maybeSingle();

  let query = supabase
    .from("leave_requests")
    .select(REQUEST_SELECT)
    .order("starts_on", { ascending: false })
    .limit(50);

  // Scoped explicitly as well as by RLS: someone with leave.view_all would
  // otherwise see the whole organisation on their own leave page.
  if (employee?.id) query = query.eq("employee_id", employee.id);

  const { data, error } = await query;
  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as LeaveRequestRow[], error: null };
}

/** The approval queue, oldest first — the design sorts by wait time. */
export async function listPendingApprovals(): Promise<{
  rows: LeaveRequestRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .select(REQUEST_SELECT)
    .in("status", ["pending_hod", "pending_hr"])
    .order("submitted_at", { ascending: true });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as LeaveRequestRow[], error: null };
}

export type BalanceRow = {
  leave_type: { id: string; name: string } | null;
  entitled_days: number;
  taken_days: number;
  leave_year: number;
};

export async function listMyBalances(): Promise<BalanceRow[]> {
  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .maybeSingle();
  if (!employee?.id) return [];

  const { data } = await supabase
    .from("leave_balances")
    .select("entitled_days, taken_days, leave_year, leave_type:leave_types(id, name)")
    .eq("employee_id", employee.id)
    .eq("leave_year", new Date().getFullYear());

  return (data ?? []) as unknown as BalanceRow[];
}

export type LeaveTypeRow = {
  id: string;
  name: string;
  paid: boolean;
  annual_entitlement_days: number | null;
};

/**
 * Leave types available to request against.
 *
 * Every active type, not only the ones the employee already holds a balance
 * row for — a first request of the year has no balance yet, and hiding the
 * type would make it look unavailable.
 */
export async function listLeaveTypes(): Promise<LeaveTypeRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("leave_types")
    .select("id, name, paid, annual_entitlement_days")
    .eq("active", true)
    .order("name");

  return (data ?? []) as LeaveTypeRow[];
}

// ---------------------------------------------------------------------------
// Balances, for whoever administers them
// ---------------------------------------------------------------------------

export type EmployeeBalances = {
  employeeId: string;
  employeeNo: string;
  name: string;
  department: string | null;
  /** Keyed by leave type id. Absent means no row for this year yet. */
  byType: Record<string, { entitled: number; taken: number }>;
};

/**
 * Everyone's balances for one leave year.
 *
 * Two queries rather than an embed from `employees`, because an employee with
 * no balance row at all is the case that matters most — they are the person
 * who cannot request leave — and an inner join would hide exactly them.
 *
 * Scope is RLS's: `leave_balances_select_department` narrows an HOD to their
 * own people without a `where` clause here.
 */
export async function listBalances(year: number): Promise<{
  rows: EmployeeBalances[];
  error: boolean;
}> {
  const supabase = await createClient();

  const [{ data: employees, error: empError }, { data: balances }] =
    await Promise.all([
      supabase
        .from("employees")
        .select("id, employee_no, first_name, last_name, department:departments(name)")
        .neq("employment_status", "exited")
        .order("last_name"),
      supabase
        .from("leave_balances")
        .select("employee_id, leave_type_id, entitled_days, taken_days")
        .eq("leave_year", year),
    ]);

  if (empError) {
    console.error("leave: listBalances failed", empError.message, empError.code);
    return { rows: [], error: true };
  }

  const byEmployee = new Map<string, EmployeeBalances["byType"]>();
  for (const b of balances ?? []) {
    const key = b.employee_id as string;
    const existing = byEmployee.get(key) ?? {};
    existing[b.leave_type_id as string] = {
      entitled: Number(b.entitled_days),
      taken: Number(b.taken_days),
    };
    byEmployee.set(key, existing);
  }

  return {
    error: false,
    rows: (employees ?? []).map((e) => {
      const department = e.department as unknown as { name: string } | null;
      return {
        employeeId: e.id as string,
        employeeNo: e.employee_no as string,
        name: `${e.first_name} ${e.last_name}`,
        department: department?.name ?? null,
        byType: byEmployee.get(e.id as string) ?? {},
      };
    }),
  };
}
