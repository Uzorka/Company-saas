"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession, assertPermission } from "@/lib/auth/session";

/**
 * Task mutations.
 *
 * Field visits go through submit_field_visit() and review_field_visit(),
 * which derive the distance from the task's own target and refuse an
 * out-of-range submission outright. Nothing here recomputes that — the
 * database is the one place it is decided.
 */
export type ActionResult = { ok: true } | { ok: false; error: string };

const reviewSchema = z.object({
  visitId: z.string().uuid(),
  accept: z.boolean(),
  reason: z.string().trim().max(2000).optional(),
});

export async function reviewVisit(
  input: z.input<typeof reviewSchema>,
): Promise<ActionResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the details." };

  const { visitId, accept, reason } = parsed.data;

  // Checked here so the person gets a useful message rather than a database
  // error, and again in the function so it cannot be skipped.
  if (!accept && (reason?.trim().length ?? 0) < 10) {
    return {
      ok: false,
      error:
        "Say what needs redoing — the assignee has to know what to change.",
    };
  }

  const session = await requireSession();
  assertPermission(session, "tasks.verify_visit");

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_field_visit", {
    p_visit_id: visitId,
    p_accept: accept,
    p_reason: reason ?? null,
  });

  if (error) {
    return { ok: false, error: "That couldn't be saved. Try again." };
  }

  revalidatePath("/[org]/tasks", "page");
  return { ok: true };
}

const statusSchema = z.object({
  taskId: z.string().uuid(),
  status: z.enum(["todo", "in_progress", "review", "completed", "cancelled"]),
});

export async function setTaskStatus(
  input: z.input<typeof statusSchema>,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Unknown status." };

  await requireSession();

  const supabase = await createClient();
  const { error } = await supabase
    .from("tasks")
    .update({
      status: parsed.data.status,
      completed_at:
        parsed.data.status === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.taskId);

  if (error) {
    // RLS refuses the update for someone without the right scope, so this is
    // the honest message rather than a generic failure.
    return {
      ok: false,
      error: "You can't change this task's status.",
    };
  }

  revalidatePath("/[org]/tasks", "page");
  return { ok: true };
}
