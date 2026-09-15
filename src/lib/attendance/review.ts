"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg, can } from "@/lib/auth/session";
import {
  type FormState,
  describeWriteError,
  refusedIfEmpty,
} from "@/lib/forms/result";

/**
 * Reviewing flagged attendance.
 *
 * A check-in outside its geofence, or with poor accuracy, is recorded with
 * `review_state = 'pending'`. Until now nothing could move it off that: the
 * attendance screen counted flagged days and offered no way to deal with one,
 * so "Needs review" was a number that only ever went up.
 *
 * TWO OUTCOMES, AND THE ORIGINAL SURVIVES BOTH
 *
 * Approving accepts the record as it stands. Correcting writes a row to
 * `attendance_corrections` carrying the reason and the corrected times, and
 * marks the record 'corrected' — it does not rewrite it. `check_in_at` is
 * immutable by trigger, and the rest is left alone on purpose: a check-in is
 * evidence in a pay dispute, and the useful artefact is "recorded 08:40,
 * corrected to 08:05 by HR because the depot has no signal", not a row that
 * has always said 08:05.
 *
 * `attendance.review` is required, by policy on both tables. The checks here
 * decide what to render; the database decides what happens.
 */

const approveSchema = z.object({
  recordId: z.string().uuid(),
});

const correctSchema = z.object({
  recordId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(10, "Say what was wrong and how you know — this is kept permanently")
    .max(1000),
  // Times as the browser's datetime-local value, or blank to leave as recorded.
  newCheckIn: z.string().trim().max(40).optional().or(z.literal("")),
  newCheckOut: z.string().trim().max(40).optional().or(z.literal("")),
  newType: z.enum(["", "office", "remote", "uncertain"]).optional(),
});

export async function approveAttendance(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = approveSchema.safeParse({ recordId: formData.get("recordId") });
  if (!parsed.success) return { error: "That record could not be found." };

  const session = await requireOrg(org);
  if (!can(session, "attendance.review")) {
    return { error: "Reviewing attendance needs attendance.review." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance_records")
    .update({ review_state: "approved" })
    .eq("id", parsed.data.recordId)
    .eq("review_state", "pending")
    .select("id");

  if (error) {
    return { error: describeWriteError(error.code, error.message, "Already reviewed.") };
  }

  const refused = refusedIfEmpty(
    data,
    "That record is no longer awaiting review — someone may have just dealt with it.",
  );
  if (refused) return { error: refused };

  revalidatePath("/[org]/attendance", "page");
  return { done: true };
}

export async function correctAttendance(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = correctSchema.safeParse({
    recordId: formData.get("recordId"),
    reason: formData.get("reason"),
    newCheckIn: formData.get("newCheckIn") ?? "",
    newCheckOut: formData.get("newCheckOut") ?? "",
    newType: formData.get("newType") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const session = await requireOrg(org);
  if (!can(session, "attendance.review")) {
    return { error: "Correcting attendance needs attendance.review." };
  }

  const newCheckIn = toTimestamp(parsed.data.newCheckIn);
  const newCheckOut = toTimestamp(parsed.data.newCheckOut);
  const newType = parsed.data.newType || null;

  if (!newCheckIn && !newCheckOut && !newType) {
    return {
      error:
        "Nothing was changed. Enter a corrected time or type, or approve the " +
        "record as recorded instead.",
    };
  }
  if (newCheckIn && newCheckOut && newCheckOut <= newCheckIn) {
    return { error: "The corrected check-out must be after the check-in." };
  }

  const supabase = await createClient();

  // The previous values are read here rather than taken from the form: a
  // correction is a claim about what the record said, and a browser should not
  // be the source of that claim.
  const { data: record } = await supabase
    .from("attendance_records")
    .select("id, check_in_at, check_out_at, attendance_type, review_state")
    .eq("id", parsed.data.recordId)
    .maybeSingle();

  if (!record) return { error: "That record could not be found." };

  const { error: insertError } = await supabase
    .from("attendance_corrections")
    .insert({
      organization_id: session.organizationId,
      attendance_record_id: record.id,
      corrected_by: session.userId,
      reason: parsed.data.reason,
      previous_check_in_at: record.check_in_at,
      previous_check_out_at: record.check_out_at,
      previous_type: record.attendance_type,
      new_check_in_at: newCheckIn,
      new_check_out_at: newCheckOut,
      new_type: newType,
    });

  if (insertError) {
    return {
      error: describeWriteError(
        insertError.code,
        insertError.message,
        "That correction is already recorded.",
      ),
    };
  }

  // The correction is the record of what happened, so it is written first. If
  // the flag below fails the correction still stands and the record simply
  // stays pending, which is the safe direction to fail in.
  const { data: flagged, error: flagError } = await supabase
    .from("attendance_records")
    .update({ review_state: "corrected" })
    .eq("id", record.id)
    .select("id");

  if (flagError || !flagged || flagged.length === 0) {
    return {
      error:
        "The correction was recorded, but the record could not be marked as " +
        "corrected. It will still show as needing review.",
    };
  }

  revalidatePath("/[org]/attendance", "page");
  return { done: true };
}

/**
 * A `datetime-local` value has no timezone, so the browser's own offset is
 * applied when it is parsed. That is the right reading here: whoever is
 * correcting the record is entering the time as it was on site.
 */
function toTimestamp(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
