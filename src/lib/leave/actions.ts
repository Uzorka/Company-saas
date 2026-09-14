"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession } from "@/lib/auth/session";
import { type FormState, humanise as humaniseShared } from "@/lib/forms/result";

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


const requestSchema = z
  .object({
    leaveTypeId: z.string().uuid("Choose a leave type"),
    startsOn: z.string().date("Choose a start date"),
    endsOn: z.string().date("Choose an end date"),
    reason: z.string().trim().max(2000).optional().or(z.literal("")),
  })
  .refine((value) => value.endsOn >= value.startsOn, {
    message: "The end date cannot be before the start date.",
    path: ["endsOn"],
  });

/**
 * Submit a leave request.
 *
 * This is the step that was missing: `decide_leave_request` and
 * `cancel_leave_request` were both wired up, so managers could approve and
 * employees could cancel requests that no one could create.
 *
 * `leave_requests` has no insert policy by design — the balance check, the
 * working-day count and the two-stage routing all have to happen together, so
 * the write goes through `submit_leave_request()`, which owns those rules.
 * Nothing here re-implements them.
 */
export async function requestLeave(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = requestSchema.safeParse({
    leaveTypeId: formData.get("leaveTypeId"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
    reason: formData.get("reason") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  await requireSession();
  const supabase = await createClient();

  const { error } = await supabase.rpc("submit_leave_request", {
    p_leave_type_id: parsed.data.leaveTypeId,
    p_starts_on: parsed.data.startsOn,
    p_ends_on: parsed.data.endsOn,
    p_reason: parsed.data.reason || null,
    p_document_path: null,
  });

  if (error) return { error: humaniseShared(error.message) };

  revalidatePath("/[org]/leave", "page");
  return { done: true };
}
