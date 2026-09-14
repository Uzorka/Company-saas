"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/session";
import { type FormState, describeWriteError } from "@/lib/forms/result";
import { requireSession } from "@/lib/auth/session";

/**
 * Payroll mutations.
 *
 * Thin by design. The pipeline order, the separation of duties and the
 * locking all live in advance_payroll(); this layer validates the shape and
 * relays the database's own message, which is written for a person.
 */
export type PayrollResult = { ok: true } | { ok: false; error: string };

const advanceSchema = z.object({
  periodId: z.string().uuid(),
  to: z.enum(["review", "approved", "published", "closed"]),
});

export async function advancePayroll(
  input: z.input<typeof advanceSchema>,
): Promise<PayrollResult> {
  const parsed = advanceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown transition." };

  await requireSession();
  const supabase = await createClient();

  const { error } = await supabase.rpc("advance_payroll", {
    p_period_id: parsed.data.periodId,
    p_to: parsed.data.to,
  });

  if (error) return { ok: false, error: relay(error.message) };

  revalidatePath("/[org]/payroll", "layout");
  return { ok: true };
}

export async function recalculatePayroll(
  periodId: string,
): Promise<PayrollResult> {
  if (!z.string().uuid().safeParse(periodId).success) {
    return { ok: false, error: "Unknown period." };
  }

  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("calculate_payroll", {
    p_period_id: periodId,
  });

  if (error) return { ok: false, error: relay(error.message) };

  revalidatePath("/[org]/payroll", "layout");
  return { ok: true };
}

/** Pass through our own messages; replace anything else. */
function relay(message: string): string {
  const cleaned = message.replace(/^ERROR:\s*/i, "").trim();
  return cleaned.length > 0 && cleaned.length < 200 && /^[A-Z]/.test(cleaned)
    ? cleaned
    : "That couldn't be saved. Nothing has changed — try again.";
}


const periodSchema = z
  .object({
    label: z.string().trim().min(1, "Name the period — for example March 2026").max(80),
    startsOn: z.string().date("Choose a start date"),
    endsOn: z.string().date("Choose an end date"),
    payDate: z.string().date().optional().or(z.literal("")),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "The period cannot end before it starts.",
    path: ["endsOn"],
  })
  .refine(
    (value) => !value.payDate || value.payDate >= value.startsOn,
    { message: "The pay date cannot fall before the period starts.", path: ["payDate"] },
  );

/**
 * Open a payroll run.
 *
 * The period is created empty and in `draft`. It does not calculate anything:
 * `calculate_payroll()` builds the lines, and it is a separate, deliberate
 * step. Creating a period and immediately costing it would make an accidental
 * click look like a payroll.
 *
 * Everything after draft — submit, approve, publish, and the rule that the
 * submitter cannot approve — belongs to `advance_payroll()`.
 */
export async function createPayrollPeriod(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = periodSchema.safeParse({
    label: formData.get("label"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
    payDate: formData.get("payDate") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const session = await requireOrg(org);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("payroll_periods")
    .insert({
      organization_id: session.organizationId,
      label: parsed.data.label,
      starts_on: parsed.data.startsOn,
      ends_on: parsed.data.endsOn,
      pay_date: parsed.data.payDate || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: describeWriteError(
        error?.code,
        error?.message ?? "",
        `A payroll period called “${parsed.data.label}” already exists.`,
      ),
    };
  }

  revalidatePath("/[org]/payroll", "page");
  return { done: true, id: data.id };
}
