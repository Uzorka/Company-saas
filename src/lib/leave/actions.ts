"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";

/**
 * Leave mutations.
 *
 * Every rule that costs an employee days — the balance check, the two-stage
 * routing, the self-approval block — lives in the database functions. Nothing
 * here re-implements them; this layer validates shape and turns a database
 * error into a sentence a person can act on.
 */
export type LeaveResult = { ok: true } | { ok: false; error: string };

const decideSchema = z.object({
  requestId: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().trim().max(2000).optional(),
});

export async function decideLeave(
  input: z.input<typeof decideSchema>,
): Promise<LeaveResult> {
  const parsed = decideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the details." };

  const { requestId, approve, note } = parsed.data;

  if (!approve && (note?.trim().length ?? 0) < 10) {
    return {
      ok: false,
      error: "Say why — the employee sees this and may want to re-plan around it.",
    };
  }

  await requireSession();
  const supabase = await createClient();

  const { error } = await supabase.rpc("decide_leave_request", {
    p_request_id: requestId,
    p_approve: approve,
    p_note: note ?? null,
  });

  if (error) {
    // The database messages here are written for the person reading them —
    // "You do not head this employee's department", not a code — so passing
    // them through is more useful than a generic failure.
    return { ok: false, error: humanise(error.message) };
  }

  revalidatePath("/[org]/leave", "page");
  return { ok: true };
}

export async function cancelLeave(requestId: string): Promise<LeaveResult> {
  if (!z.string().uuid().safeParse(requestId).success) {
    return { ok: false, error: "Unknown request." };
  }

  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_leave_request", {
    p_request_id: requestId,
  });

  if (error) return { ok: false, error: humanise(error.message) };

  revalidatePath("/[org]/leave", "page");
  return { ok: true };
}

/**
 * Strip the Postgres framing from a message written for a human.
 *
 * Anything that does not look like one of our own messages is replaced
 * wholesale — an internal error should never reach a user as a raw string.
 */
function humanise(message: string): string {
  const cleaned = message.replace(/^ERROR:\s*/i, "").trim();
  const looksIntentional =
    cleaned.length > 0 && cleaned.length < 200 && /^[A-Z]/.test(cleaned);
  return looksIntentional
    ? cleaned
    : "That couldn't be saved. Nothing has changed — try again.";
}
