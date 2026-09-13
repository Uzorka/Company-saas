"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
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
