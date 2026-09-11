"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession, assertPermission } from "@/lib/auth/session";

/**
 * Attendance mutations.
 *
 * The client sends a position and an accuracy — facts only the device knows —
 * and nothing else. The employee, the organization, the timestamp, the
 * classification and whether the record needs review are all derived
 * server-side by check_in(), so none of them can be chosen by the caller.
 */
const positionSchema = z.object({
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  // A device occasionally reports an absurd accuracy; cap it rather than
  // storing a number that would make the record look precise or nonsensical.
  accuracyM: z.number().min(0).max(100_000).nullable(),
  device: z.string().max(200).optional(),
});

export type AttendanceActionResult =
  | { ok: true; recordId: string; attendanceType: string; reviewRequired: boolean }
  | { ok: false; error: string };

export async function checkIn(
  input: z.input<typeof positionSchema>,
): Promise<AttendanceActionResult> {
  const parsed = positionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That position reading wasn't valid." };
  }

  const session = await requireSession();
  assertPermission(session, "attendance.check_in");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("check_in", {
      p_latitude: parsed.data.latitude,
      p_longitude: parsed.data.longitude,
      p_accuracy_m: parsed.data.accuracyM,
      p_device: parsed.data.device ?? null,
    })
    .single();

  if (error) {
    return {
      ok: false,
      error:
        "Your check-in couldn't be saved. Nothing was recorded — try again.",
    };
  }

  const record = data as {
    id: string;
    attendance_type: string;
    review_state: string;
  };

  revalidatePath("/[org]/attendance", "page");

  return {
    ok: true,
    recordId: record.id,
    attendanceType: record.attendance_type,
    reviewRequired: record.review_state === "pending",
  };
}

export async function checkOut(
  input: z.input<typeof positionSchema>,
): Promise<AttendanceActionResult> {
  const parsed = positionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That position reading wasn't valid." };
  }

  const session = await requireSession();
  assertPermission(session, "attendance.check_in");

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("check_out", {
      p_latitude: parsed.data.latitude,
      p_longitude: parsed.data.longitude,
      p_accuracy_m: parsed.data.accuracyM,
    })
    .single();

  if (error) {
    return { ok: false, error: "Your check-out couldn't be saved. Try again." };
  }

  const record = data as { id: string; attendance_type: string };
  revalidatePath("/[org]/attendance", "page");

  return {
    ok: true,
    recordId: record.id,
    attendanceType: record.attendance_type,
    reviewRequired: false,
  };
}

/**
 * Store the selfie against a record.
 *
 * The path is built server-side from the caller's own organization and
 * employee id, so a client cannot write into another tenant's prefix even
 * though the upload itself happens from the browser.
 */
export async function attachSelfie(
  recordId: string,
  file: File,
): Promise<{ ok: boolean; error?: string }> {
  const session = await requireSession();

  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "That file isn't an image." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "That image is too large." };
  }

  const supabase = await createClient();

  const { data: employee } = await supabase
    .from("employees")
    .select("id")
    .eq("user_id", session.userId)
    .maybeSingle();

  if (!employee) return { ok: false, error: "No employee record for this account." };

  const path = `${session.organizationId}/${employee.id}/${recordId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("attendance-selfies")
    .upload(path, file, { contentType: "image/jpeg", upsert: false });

  if (uploadError) {
    return { ok: false, error: "The selfie couldn't be saved." };
  }

  const { error: rowError } = await supabase.from("attendance_evidence").insert({
    organization_id: session.organizationId,
    attendance_record_id: recordId,
    kind: "check_in_selfie",
    storage_path: path,
  });

  if (rowError) return { ok: false, error: "The selfie couldn't be linked." };

  return { ok: true };
}
