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
