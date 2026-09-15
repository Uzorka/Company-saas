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
 * High-risk role grants: the two-stage path.
 *
 * Management, HR and Accounts carry payroll, document, settings and audit
 * access. Since migration 0033 a trigger on `user_roles` refuses to grant one
 * directly, so the only way in is through a request that a *second* person
 * approves — which is the control `role_grant_requests` was built for in 0003.
 *
 * Until now the schema enforced that and the product offered no way through
 * it, which meant the rule read as "high-risk roles cannot be granted at all".
 * These actions are that missing path.
 *
 * WHAT ENFORCES WHAT
 *
 *  - The caller needs `roles.manage`. Checked here for the screen, and again
 *    by RLS (`role_grants_insert` / `role_grants_update`) for the write.
 *  - The approver may not be the requester. A CHECK constraint on the table
 *    enforces that, so it holds even if this file is wrong.
 *  - A request only becomes `active` with a second approver. The
 *    `enforce_second_approver` trigger enforces that.
 *  - `user_roles` only accepts a high-risk role once such a request exists.
 *    The 0033 trigger enforces that.
 *
 * None of those four live in this file. This file is the path; the database is
 * the boundary.
 */

const requestSchema = z.object({
  targetUserId: z.string().uuid("Choose who the role is for"),
  roleId: z.string().uuid("Choose a role"),
  reason: z
    .string()
    .trim()
    .min(10, "Say why, in a sentence — this is kept permanently")
    .max(500),
});

const decisionSchema = z.object({
  requestId: z.string().uuid(),
});

export type GrantState = FormState;

/** Stage one: ask. Never grants anything by itself. */
export async function requestRoleGrant(
  _prev: GrantState,
  formData: FormData,
): Promise<GrantState> {
  const org = String(formData.get("org") ?? "");
  const parsed = requestSchema.safeParse({
    targetUserId: formData.get("targetUserId"),
    roleId: formData.get("roleId"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const session = await requireOrg(org);
  if (!can(session, "roles.manage")) {
    return { error: "Requesting a role grant needs roles.manage." };
  }

  const supabase = await createClient();

  const { error } = await supabase.from("role_grant_requests").insert({
    organization_id: session.organizationId,
    target_user_id: parsed.data.targetUserId,
    role_id: parsed.data.roleId,
    reason: parsed.data.reason,
    requested_by: session.userId,
    status: "awaiting_second_approver",
  });

  if (error) {
    return {
      error: describeWriteError(
        error.code,
        error.message,
        "There is already a request like this one.",
      ),
    };
  }

  revalidatePath("/[org]/settings", "page");
  return { done: true };
}

/**
 * Stage two: a different person approves, and the role is granted.
 *
 * Two writes, in this order. The request must be `active` with an approver
 * before `user_roles` will accept the row — that is what the 0033 trigger
 * looks for — so if the second write fails the first is rolled back by hand,
 * leaving no approved request standing for a role nobody holds.
 */
export async function approveRoleGrant(
  _prev: GrantState,
  formData: FormData,
): Promise<GrantState> {
  const org = String(formData.get("org") ?? "");
  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { error: "That request could not be found." };

  const session = await requireOrg(org);
  if (!can(session, "roles.manage")) {
    return { error: "Approving a role grant needs roles.manage." };
  }

  const supabase = await createClient();

  const { data: request, error: readError } = await supabase
    .from("role_grant_requests")
    .select("id, target_user_id, role_id, requested_by, status")
    .eq("id", parsed.data.requestId)
    .maybeSingle();

  if (readError || !request) {
    return { error: "That request could not be found." };
  }
  if (request.status === "active") {
    return { error: "That request has already been approved." };
  }
  if (request.status !== "awaiting_second_approver") {
    return { error: "That request is closed and cannot be approved." };
  }
  // The table's CHECK constraint says the same thing. Saying it here too turns
  // a database error into a sentence that explains the rule.
  if (request.requested_by === session.userId) {
    return {
      error:
        "You raised this request, so you cannot also approve it. " +
        "A second person with roles.manage has to.",
    };
  }

  const { data: approved, error: approveError } = await supabase
    .from("role_grant_requests")
    .update({
      status: "active",
      second_approver_id: session.userId,
      second_approved_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .eq("status", "awaiting_second_approver")
    .select("id");

  if (approveError) {
    return {
      error: describeWriteError(
        approveError.code,
        approveError.message,
        "That request has already been decided.",
      ),
    };
  }

  // Zero rows means the policy refused it or somebody else decided it between
  // the read above and this write. Either way the grant below must not run.
  const approveRefused = refusedIfEmpty(
    approved,
    "That request was decided by someone else a moment ago. Reload to see where it stands.",
  );
  if (approveRefused) return { error: approveRefused };

  const { error: grantError } = await supabase.from("user_roles").insert({
    organization_id: session.organizationId,
    user_id: request.target_user_id,
    role_id: request.role_id,
  });

  if (grantError) {
    // Put the request back, so an approved-but-ungranted row is not left
    // standing — the 0033 trigger looks for exactly that shape, and one
    // sitting there would let a later direct insert through.
    const { data: rolledBack } = await supabase
      .from("role_grant_requests")
      .update({
        status: "awaiting_second_approver",
        second_approver_id: null,
        second_approved_at: null,
      })
      .eq("id", request.id)
      .select("id");

    if (!rolledBack || rolledBack.length === 0) {
      return {
        error:
          "The role could not be granted, and the approval could not be undone. " +
          "This request now shows as approved without the role having been given — " +
          "tell an administrator before anyone acts on it.",
      };
    }

    return {
      error: describeWriteError(
        grantError.code,
        grantError.message,
        "They already hold that role.",
      ),
    };
  }

  revalidatePath("/[org]/settings", "page");
  return { done: true };
}

/** Decline a request without granting anything. */
export async function declineRoleGrant(
  _prev: GrantState,
  formData: FormData,
): Promise<GrantState> {
  const org = String(formData.get("org") ?? "");
  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { error: "That request could not be found." };

  const session = await requireOrg(org);
  if (!can(session, "roles.manage")) {
    return { error: "Deciding a role grant needs roles.manage." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_grant_requests")
    .update({ status: "declined" })
    .eq("id", parsed.data.requestId)
    .eq("status", "awaiting_second_approver")
    .select("id");

  if (error) {
    return { error: describeWriteError(error.code, error.message, "Already decided.") };
  }

  const refused = refusedIfEmpty(
    data,
    "That request was decided by someone else a moment ago. Reload to see where it stands.",
  );
  if (refused) return { error: refused };

  revalidatePath("/[org]/settings", "page");
  return { done: true };
}

/**
 * Take a granted role away.
 *
 * The request row is marked revoked rather than deleted — there is no delete
 * policy on the table, by design, so the history of who held what stays
 * readable. The `user_roles` row is what actually goes.
 */
export async function revokeRoleGrant(
  _prev: GrantState,
  formData: FormData,
): Promise<GrantState> {
  const org = String(formData.get("org") ?? "");
  const parsed = decisionSchema.safeParse({
    requestId: formData.get("requestId"),
  });
  if (!parsed.success) return { error: "That request could not be found." };

  const session = await requireOrg(org);
  if (!can(session, "roles.manage")) {
    return { error: "Revoking a role needs roles.manage." };
  }

  const supabase = await createClient();

  const { data: request } = await supabase
    .from("role_grant_requests")
    .select("id, target_user_id, role_id, status")
    .eq("id", parsed.data.requestId)
    .maybeSingle();

  if (!request) return { error: "That request could not be found." };
  if (request.status !== "active") {
    return { error: "That role is not currently granted through this request." };
  }
  if (request.target_user_id === session.userId) {
    return {
      error:
        "You cannot revoke your own role. Ask another administrator, so the " +
        "workspace is never left without one.",
    };
  }

  const { data: removed, error: removeError } = await supabase
    .from("user_roles")
    .delete()
    .eq("organization_id", session.organizationId)
    .eq("user_id", request.target_user_id)
    .eq("role_id", request.role_id)
    .select("user_id");

  if (removeError) {
    return { error: describeWriteError(removeError.code, removeError.message, "") };
  }

  // The dangerous one: a refused delete changes nothing and raises nothing, so
  // without this the request would be marked revoked while the person kept the
  // role. The screen would say the access was taken away and it would not have
  // been.
  const removeRefused = refusedIfEmpty(
    removed,
    "That role could not be removed, so nothing has been changed.",
  );
  if (removeRefused) return { error: removeRefused };

  const { data: marked, error: markError } = await supabase
    .from("role_grant_requests")
    .update({
      status: "revoked",
      revoked_by: session.userId,
      revoked_at: new Date().toISOString(),
    })
    .eq("id", request.id)
    .select("id");

  if (markError) {
    return { error: describeWriteError(markError.code, markError.message, "") };
  }

  // The role is already gone by this point. Say so plainly rather than report
  // a clean revocation whose record did not get written.
  const markRefused = refusedIfEmpty(
    marked,
    "The role was removed, but the record of the revocation could not be written. Tell an administrator.",
  );
  if (markRefused) return { error: markRefused };

  revalidatePath("/[org]/settings", "page");
  return { done: true };
}
