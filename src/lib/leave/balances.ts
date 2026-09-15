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
 * Setting leave entitlements.
 *
 * Without this the leave module does not work at all, and quietly. A balance
 * row is created only by `apply_leave_balance` on final approval, so a new
 * leave year starts with none; `leave_days_remaining` returns 0 when there is
 * no row; and `request_leave` refuses any capped type with "You have 0 days of
 * Annual left". Nothing in the product could create the row that would make
 * the answer anything else.
 *
 * `leave.manage_policy` is what the `leave_balances_manage` policy requires.
 * The checks here decide what to render.
 *
 * `taken_days` is deliberately not settable. It moves only when a request is
 * finally approved, which is the one rule migration 0019 singles out as the
 * one that most needs to hold; a screen that let someone type over it would be
 * a way around the approval chain rather than a way to fix a number.
 */

const setSchema = z.object({
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  entitledDays: z.coerce
    .number()
    .min(0, "Entitlement cannot be negative")
    .max(365, "That is more days than there are in a year"),
});

export async function setLeaveBalance(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = setSchema.safeParse({
    employeeId: formData.get("employeeId"),
    leaveTypeId: formData.get("leaveTypeId"),
    year: formData.get("year"),
    entitledDays: formData.get("entitledDays"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the values." };
  }

  const session = await requireOrg(org);
  if (!can(session, "leave.manage_policy")) {
    return { error: "Setting entitlements needs leave.manage_policy." };
  }

  const supabase = await createClient();

  // Upsert on the table's own unique key. The insert path carries taken_days 0
  // because the row is new; the update path leaves taken_days alone, since it
  // is not in the payload.
  const { data, error } = await supabase
    .from("leave_balances")
    .upsert(
      {
        organization_id: session.organizationId,
        employee_id: parsed.data.employeeId,
        leave_type_id: parsed.data.leaveTypeId,
        leave_year: parsed.data.year,
        entitled_days: parsed.data.entitledDays,
      },
      { onConflict: "employee_id,leave_type_id,leave_year" },
    )
    .select("id");

  if (error) {
    return {
      error: describeWriteError(
        error.code,
        error.message,
        "That balance already exists.",
      ),
    };
  }

  const refused = refusedIfEmpty(data, "You don't have permission to set that.");
  if (refused) return { error: refused };

  revalidatePath("/[org]/leave/balances", "page");
  revalidatePath("/[org]/leave", "page");
  return { done: true };
}

const openYearSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

/**
 * Open a leave year: give everyone who has no row yet the entitlement their
 * leave type already carries.
 *
 * Not a policy decision — `leave_types.annual_entitlement_days` is where the
 * entitlement is configured, and this applies it. Rows that already exist are
 * left exactly as they are, so someone's negotiated extra days survive this
 * being run twice, and so does a mid-year adjustment.
 */
export async function openLeaveYear(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = openYearSchema.safeParse({ year: formData.get("year") });
  if (!parsed.success) return { error: "Choose a year." };

  const session = await requireOrg(org);
  if (!can(session, "leave.manage_policy")) {
    return { error: "Opening a leave year needs leave.manage_policy." };
  }

  const supabase = await createClient();

  const [{ data: types }, { data: employees }] = await Promise.all([
    supabase
      .from("leave_types")
      .select("id, annual_entitlement_days")
      .eq("active", true)
      .not("annual_entitlement_days", "is", null),
    supabase
      .from("employees")
      .select("id")
      .neq("employment_status", "exited"),
  ]);

  if (!types?.length || !employees?.length) {
    return {
      error: !types?.length
        ? "No leave type has an annual entitlement configured, so there is nothing to apply."
        : "There are no active employees to give leave to.",
    };
  }

  const rows = employees.flatMap((e) =>
    types.map((t) => ({
      organization_id: session.organizationId,
      employee_id: e.id as string,
      leave_type_id: t.id as string,
      leave_year: parsed.data.year,
      entitled_days: Number(t.annual_entitlement_days),
    })),
  );

  const { data, error } = await supabase
    .from("leave_balances")
    .upsert(rows, {
      onConflict: "employee_id,leave_type_id,leave_year",
      ignoreDuplicates: true,
    })
    .select("id");

  if (error) {
    return {
      error: describeWriteError(error.code, error.message, "Already opened."),
    };
  }

  const created = data?.length ?? 0;

  revalidatePath("/[org]/leave/balances", "page");
  revalidatePath("/[org]/leave", "page");

  // Zero created is a real outcome, not a refusal: every row already existed.
  // Reported as a message rather than a silent success, because "nothing
  // happened" and "everyone now has leave" look identical otherwise.
  if (created === 0) {
    return {
      error: `Every balance for ${parsed.data.year} already exists — nothing was changed.`,
    };
  }

  return { done: true };
}
