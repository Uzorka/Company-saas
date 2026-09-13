import type { StatusTone } from "@/lib/status";

/**
 * Payroll vocabulary and money formatting.
 *
 * No arithmetic lives here. Every figure a payslip shows is computed in SQL
 * and read back as a decimal string — this module only decides how to render
 * it. Doing sums in JavaScript would put a second, subtly different answer in
 * the product.
 */
export const PAYROLL_STATUSES = [
  "draft",
  "processing",
  "review",
  "approved",
  "published",
  "closed",
] as const;
export type PayrollStatus = (typeof PAYROLL_STATUSES)[number];

export const payrollStatusLabel: Record<PayrollStatus, string> = {
  draft: "Draft",
  processing: "Processing",
  review: "In review",
  approved: "Approved",
  published: "Published",
  closed: "Closed",
};

export const payrollStatusTone: Record<PayrollStatus, StatusTone> = {
  draft: "mute",
  processing: "info",
  review: "warn",
  approved: "info",
  published: "success",
  closed: "mute",
};

/** What each status means, in the words shown on the run header. */
export const payrollStatusMeaning: Record<PayrollStatus, string> = {
  draft: "Generated from contracts and attendance. Nothing is locked yet.",
  processing: "Being worked through. Figures can still be recalculated.",
  review: "Figures complete, waiting on a second pair of eyes.",
  approved: "Signed off. The figures are locked and cannot be recalculated.",
  published: "Payslips are visible to employees. This cannot be undone.",
  closed: "Fully read-only.",
};

/** The action that moves a run on, and who may take it. */
export const nextTransition: Record<
  PayrollStatus,
  { to: PayrollStatus; label: string; permission: string; irreversible?: boolean } | null
> = {
  draft: { to: "review", label: "Send for review", permission: "payroll.process" },
  processing: { to: "review", label: "Send for review", permission: "payroll.process" },
  review: { to: "approved", label: "Approve", permission: "payroll.approve" },
  approved: {
    to: "published",
    label: "Publish payslips",
    permission: "payroll.publish",
    irreversible: true,
  },
  published: { to: "closed", label: "Close period", permission: "payroll.process" },
  closed: null,
};

/**
 * Format money for display.
 *
 * Amounts arrive from Postgres as decimal strings. Parsing to Number is safe
 * for *rendering* at these magnitudes, and the value never goes back to the
 * database from here — but it is worth being explicit that this is a display
 * conversion, not a calculation.
 */
export function formatMoney(
  amount: string | number | null | undefined,
  currency = "NGN",
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "—";

  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Compact form for a headline figure: ₦48.2m rather than ₦48,200,000.00. */
export function formatMoneyCompact(
  amount: string | number | null | undefined,
  currency = "NGN",
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) return "—";

  const symbol = currency === "NGN" ? "₦" : "";
  if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(2)}m`;
  if (Math.abs(value) >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`;
  return `${symbol}${value.toFixed(2)}`;
}
