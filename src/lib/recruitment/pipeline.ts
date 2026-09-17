"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg, can } from "@/lib/auth/session";
import { type FormState, humanise } from "@/lib/forms/result";
import { sendQueuedEmails, isEmailConfigured } from "@/lib/email/send";

/**
 * Moving people through hiring.
 *
 * Every one of these is a thin wrapper over a database function. The rules —
 * who may move an applicant, that a rejection needs a reason, that hiring the
 * same person twice is impossible, that the stage history is written by the
 * same statement as the move — all live in migration 0034 and 0026, because
 * `application_stage_history` has no insert policy for anyone and a control
 * that can be skipped is not a control.
 *
 * So these do three things: check the caller can see the screen, call the
 * function, and drain the email queue afterwards.
 */

export type PipelineState = FormState & {
  /** What happened to the emails this action queued. */
  mail?: {
    sent: number;
    failed: number;
    /** No provider configured: the message is written and waiting. */
    queued: boolean;
  };
};

/**
 * Send whatever the function just queued, and say plainly what happened.
 *
 * A failure here is never a failure of the action: the applicant has moved and
 * the message is recorded. Rolling the move back because an API key expired
 * would be the wrong trade, so the outcome is reported rather than thrown.
 */
async function flushMail(): Promise<PipelineState["mail"]> {
  const outcome = await sendQueuedEmails();
  return {
    sent: outcome.sent,
    failed: outcome.failed,
    queued: outcome.unconfigured,
  };
}

function guard(org: string) {
  return async () => {
    const session = await requireOrg(org);
    if (!can(session, "recruitment.move_pipeline")) {
      return "Moving an applicant needs recruitment.move_pipeline.";
    }
    return null;
  };
}

const moveSchema = z.object({
  applicationId: z.string().uuid(),
  stage: z.enum([
    "applied",
    "screening",
    "shortlisted",
    "interview",
    "offered",
    "rejected",
    "withdrawn",
  ]),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function moveApplicant(
  _prev: PipelineState,
  formData: FormData,
): Promise<PipelineState> {
  const org = String(formData.get("org") ?? "");
  const parsed = moveSchema.safeParse({
    applicationId: formData.get("applicationId"),
    stage: formData.get("stage"),
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const refusal = await guard(org)();
  if (refusal) return { error: refusal };

  const supabase = await createClient();
  const { error } = await supabase.rpc("move_application_stage", {
    p_application_id: parsed.data.applicationId,
    p_to_stage: parsed.data.stage,
    p_note: parsed.data.note || null,
  });

  // The function raises with messages written to be read — "Recording a
  // rejection needs a brief reason" — so those are passed through.
  if (error) return { error: humanise(error.message) };

  const mail = await flushMail();
  revalidatePath("/[org]/recruitment", "page");
  return { done: true, mail };
}

const holdSchema = z.object({
  applicationId: z.string().uuid(),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function holdApplicant(
  _prev: PipelineState,
  formData: FormData,
): Promise<PipelineState> {
  const org = String(formData.get("org") ?? "");
  const parsed = holdSchema.safeParse({
    applicationId: formData.get("applicationId"),
    reason: formData.get("reason") ?? "",
  });
  if (!parsed.success) return { error: "That application could not be found." };

  const refusal = await guard(org)();
  if (refusal) return { error: refusal };

  const supabase = await createClient();
  const { error } = await supabase.rpc("hold_application", {
    p_application_id: parsed.data.applicationId,
    p_reason: parsed.data.reason || null,
  });

  if (error) return { error: humanise(error.message) };

  revalidatePath("/[org]/recruitment", "page");
  // No email: being parked is internal, and what to tell a candidate about it
  // is a decision for a person in their own words.
  return { done: true };
}

const interviewSchema = z.object({
  applicationId: z.string().uuid(),
  // `datetime-local` has no timezone, so the browser's own offset applies when
  // it is parsed — which is the right reading: whoever schedules it is
  // entering the time where the interview happens.
  at: z.string().min(1, "Choose a date and time"),
  location: z.string().trim().max(300).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function scheduleInterview(
  _prev: PipelineState,
  formData: FormData,
): Promise<PipelineState> {
  const org = String(formData.get("org") ?? "");
  const parsed = interviewSchema.safeParse({
    applicationId: formData.get("applicationId"),
    at: formData.get("at"),
    location: formData.get("location") ?? "",
    note: formData.get("note") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const when = new Date(parsed.data.at);
  if (Number.isNaN(when.getTime())) {
    return { error: "That is not a date and time." };
  }
  if (when.getTime() <= Date.now()) {
    return { error: "An interview cannot be scheduled in the past." };
  }

  const refusal = await guard(org)();
  if (refusal) return { error: refusal };

  const supabase = await createClient();
  const { error } = await supabase.rpc("schedule_application_interview", {
    p_application_id: parsed.data.applicationId,
    p_at: when.toISOString(),
    p_location: parsed.data.location || null,
    p_note: parsed.data.note || null,
  });

  if (error) return { error: humanise(error.message) };

  const mail = await flushMail();
  revalidatePath("/[org]/recruitment", "page");
  return { done: true, mail };
}

const hireSchema = z.object({
  applicationId: z.string().uuid(),
  employeeNo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(
      /^[A-Z]{2,5}-[0-9]{3,6}$/,
      "Use the company's format — letters, a dash, then digits, like CHF-1042.",
    ),
  departmentId: z.string().uuid().optional().or(z.literal("")),
  positionId: z.string().uuid().optional().or(z.literal("")),
  hireDate: z.string().date("Choose a start date"),
  employmentType: z.enum(["full_time", "part_time", "contract", "intern", "nysc"]),
});

export async function hireApplicant(
  _prev: PipelineState,
  formData: FormData,
): Promise<PipelineState> {
  const org = String(formData.get("org") ?? "");
  const parsed = hireSchema.safeParse({
    applicationId: formData.get("applicationId"),
    employeeNo: formData.get("employeeNo"),
    departmentId: formData.get("departmentId") ?? "",
    positionId: formData.get("positionId") ?? "",
    hireDate: formData.get("hireDate"),
    employmentType: formData.get("employmentType"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const session = await requireOrg(org);
  if (!can(session, "recruitment.convert_employee")) {
    return { error: "Hiring an applicant needs recruitment.convert_employee." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("convert_applicant_to_employee", {
    p_application_id: parsed.data.applicationId,
    p_employee_no: parsed.data.employeeNo,
    p_department_id: parsed.data.departmentId || null,
    p_position_id: parsed.data.positionId || null,
    p_hire_date: parsed.data.hireDate,
    p_employment_type: parsed.data.employmentType,
  });

  if (error) return { error: humanise(error.message) };

  const mail = await flushMail();
  revalidatePath("/[org]/recruitment", "page");
  revalidatePath("/[org]/employees", "page");
  return { done: true, mail };
}

/** Whether the screen should warn that nothing will actually be delivered. */
export async function emailConfigured(): Promise<boolean> {
  return isEmailConfigured();
}
