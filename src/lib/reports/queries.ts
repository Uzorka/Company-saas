import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Reporting reads.
 *
 * Every one of these calls a SECURITY INVOKER function, so the caller's own
 * RLS decides the rows. Nothing here branches on role: an HOD and Management
 * run the same query and get different answers, which is the only arrangement
 * where a new report cannot accidentally widen access.
 */

export type HeadcountRow = {
  department_id: string;
  department_name: string;
  headcount: number;
  on_probation: number;
  full_time: number;
};

export type AttendanceRow = {
  work_date: string;
  records: number;
  at_office: number;
  remote: number;
  late: number;
  in_review: number;
};

export type LeaveReportRow = {
  leave_type: string;
  requests: number;
  approved: number;
  pending: number;
  declined: number;
  days_taken: number;
};

export type PayrollReportRow = {
  department_name: string;
  headcount: number;
  gross: number;
  paye: number;
  pension: number;
  net: number;
};

export async function headcountReport(): Promise<HeadcountRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_headcount");
  return (data ?? []) as HeadcountRow[];
}

export async function attendanceReport(
  from: string,
  to: string,
): Promise<AttendanceRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_attendance", {
    p_from: from,
    p_to: to,
  });
  return (data ?? []) as AttendanceRow[];
}

export async function leaveReport(year: number): Promise<LeaveReportRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_leave", { p_year: year });
  return (data ?? []) as LeaveReportRow[];
}

export async function payrollReport(
  periodId: string,
): Promise<PayrollReportRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("report_payroll", {
    p_period_id: periodId,
  });
  return (data ?? []) as PayrollReportRow[];
}

/** The most recent published run — what "payroll last month" means. */
export async function latestPublishedPeriod(): Promise<{
  id: string;
  label: string;
  currency_code: string;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payroll_periods")
    .select("id, label, currency_code")
    .eq("status", "published")
    .order("ends_on", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { id: string; label: string; currency_code: string }) ?? null;
}
