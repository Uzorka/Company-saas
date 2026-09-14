import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PayrollStatus } from "./model";

export type PeriodRow = {
  id: string;
  label: string;
  starts_on: string;
  ends_on: string;
  pay_date: string | null;
  status: PayrollStatus;
  currency_code: string;
  submitted_by: string | null;
  approved_by: string | null;
};

export type RunLineRow = {
  id: string;
  employee_no: string;
  employee_name: string;
  department_name: string | null;
  basic_salary: string;
  gross_pay: string;
  paye: string;
  pension_employee: string;
  nhf: string;
  other_deductions: string;
  total_deductions: string;
  net_pay: string;
  currency_code: string;
};

export async function listPeriods(): Promise<{
  rows: PeriodRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payroll_periods")
    .select("id, label, starts_on, ends_on, pay_date, status, currency_code, submitted_by, approved_by")
    .order("starts_on", { ascending: false });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as PeriodRow[], error: null };
}

export async function getPeriodWithLines(periodId: string): Promise<{
  period: PeriodRow | null;
  lines: RunLineRow[];
  error: string | null;
}> {
  const supabase = await createClient();

  const [{ data: period, error: periodError }, { data: lines, error: linesError }] =
    await Promise.all([
      supabase
        .from("payroll_periods")
        .select("id, label, starts_on, ends_on, pay_date, status, currency_code, submitted_by, approved_by")
        .eq("id", periodId)
        .maybeSingle(),
      supabase
        .from("payroll_run_lines")
        .select(
          `id, employee_no, employee_name, department_name, basic_salary, gross_pay,
           paye, pension_employee, nhf, other_deductions, total_deductions, net_pay,
           currency_code`,
        )
        .eq("payroll_period_id", periodId)
        .order("employee_name"),
    ]);

  const error = periodError?.message ?? linesError?.message ?? null;
  return {
    period: (period as PeriodRow) ?? null,
    lines: (lines ?? []) as RunLineRow[],
    error,
  };
}

export type PayslipRow = {
  id: string;
  published_at: string;
  line: RunLineRow & { payroll_period_id: string } | null;
};

/** An employee's own payslips. RLS restricts this to theirs. */
export async function listMyPayslips(employeeId: string | null): Promise<{
  rows: PayslipRow[];
  error: string | null;
}> {
  // No employee record means no payslips of one's own — which is the case for
  // an administrator account that was never attached to a person. Return
  // early rather than letting RLS decide: `payroll.view_all` makes every
  // payslip in the company readable, so an unfiltered query here would answer
  // "your payslips" with all 23 of them.
  if (!employeeId) return { rows: [], error: null };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payslips")
    .select(
      `id, published_at,
       line:payroll_run_lines(id, payroll_period_id, employee_no, employee_name,
         department_name, basic_salary, gross_pay, paye, pension_employee, nhf,
         other_deductions, total_deductions, net_pay, currency_code)`,
    )
    .eq("employee_id", employeeId)
    .order("published_at", { ascending: false });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as PayslipRow[], error: null };
}

/**
 * The employee record behind the signed-in account, if there is one.
 *
 * Filtered on user_id rather than read through my_employee_id(), because a
 * caller holding employees.view_all can see every row and the point here is
 * to find exactly one.
 */
export async function myEmployeeId(userId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  return data?.id ?? null;
}

/**
 * Totals for a run.
 *
 * Summed in SQL via the returned rows rather than recomputed: these are the
 * stored line figures added up, not a second calculation of payroll.
 */
export function sumLines(lines: RunLineRow[]) {
  const add = (key: keyof RunLineRow) =>
    lines.reduce((total, line) => total + Number(line[key] ?? 0), 0);

  return {
    gross: add("gross_pay"),
    deductions: add("total_deductions"),
    net: add("net_pay"),
    paye: add("paye"),
    pension: add("pension_employee"),
    count: lines.length,
  };
}
