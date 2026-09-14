"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireSession, requireOrg, assertPermission } from "@/lib/auth/session";
import { type FormState, describeWriteError } from "@/lib/forms/result";

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


const taskSchema = z
  .object({
    title: z.string().trim().min(1, "Give the task a title").max(200),
    description: z.string().trim().max(4000).optional().or(z.literal("")),
    departmentId: z
      .string()
      .uuid()
      .optional()
      .or(z.literal(""))
      .transform((value) => (value ? value : null)),
    assigneeIds: z.array(z.string().uuid()).max(25),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    verificationMode: z.enum([
      "none",
      "photo",
      "location",
      "photo_location",
      "photo_location_report",
    ]),
    startDate: z.string().date().optional().or(z.literal("")),
    dueDate: z.string().date().optional().or(z.literal("")),
  })
  .refine(
    (value) => !value.startDate || !value.dueDate || value.dueDate >= value.startDate,
    { message: "The due date cannot be before the start date.", path: ["dueDate"] },
  );

/**
 * Create a task, and assign it.
 *
 * `created_by` is taken from the session rather than the form — the insert
 * policy requires it to equal `auth.uid()`, so a form field naming someone
 * else would be refused anyway, and accepting one would suggest otherwise.
 *
 * The reference (TSK-1000, TSK-1001…) is a column default as of migration
 * 0028, so it is allocated by the database rather than chosen here.
 *
 * Assignees are written after the task exists, because they reference its id.
 * A task with no assignee is allowed: work often gets created before it gets
 * handed out, and refusing that would push people to assign it to themselves
 * as a placeholder.
 */
export async function createTask(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = taskSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    assigneeIds: formData.getAll("assigneeIds").map(String).filter(Boolean),
    priority: formData.get("priority"),
    verificationMode: formData.get("verificationMode"),
    startDate: formData.get("startDate") ?? "",
    dueDate: formData.get("dueDate") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const session = await requireOrg(org);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      organization_id: session.organizationId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      department_id: parsed.data.departmentId,
      created_by: session.userId,
      priority: parsed.data.priority,
      verification_mode: parsed.data.verificationMode,
      start_date: parsed.data.startDate || null,
      due_date: parsed.data.dueDate || null,
    })
    .select("id")
    .single();

  if (error || !data) {
    return {
      error: describeWriteError(
        error?.code,
        error?.message ?? "",
        "That task already exists.",
      ),
    };
  }

  if (parsed.data.assigneeIds.length > 0) {
    const { error: assignError } = await supabase.from("task_assignees").insert(
      parsed.data.assigneeIds.map((employeeId) => ({
        task_id: data.id,
        employee_id: employeeId,
      })),
    );

    // The task is already created. Saying it saved but went to nobody is more
    // useful than implying the whole thing failed and having it created twice.
    if (assignError) {
      revalidatePath("/[org]/tasks", "page");
      return {
        error:
          "The task was created, but it could not be assigned. Open it and add the assignees.",
      };
    }
  }

  revalidatePath("/[org]/tasks", "page");
  return { done: true, id: data.id };
}
