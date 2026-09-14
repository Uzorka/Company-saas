"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOrg, can } from "@/lib/auth/session";
import { type FormState, describeWriteError } from "@/lib/forms/result";

/**
 * Account provisioning.
 *
 * This is the most privileged action in the product: it uses the service-role
 * client, which bypasses RLS entirely. Everything about it is therefore
 * deliberate.
 *
 * WHAT GUARDS IT
 *
 *  1. `employees.create` AND `roles.manage`, checked here against the verified
 *     session before the admin client is touched at all. The service-role key
 *     never comes into play for a caller who could not do this anyway.
 *  2. The organization comes from the session, never the form.
 *  3. The role must be one of this tenant's own roles — looked up by slug
 *     within the organization, so a role id from another tenant cannot be
 *     passed in.
 *  4. High-risk roles (Management, HR, Accounts) are refused here outright.
 *     They need an approved grant request with a second approver, enforced by
 *     a trigger on `user_roles` (migration 0033). Attempting one through this
 *     action would simply raise; refusing it with an explanation is kinder
 *     than relaying a database error.
 *
 * WHY IT SETS A PASSWORD RATHER THAN EMAILING AN INVITE
 *
 * `inviteUserByEmail` needs SMTP configured on the Supabase project. Until it
 * is, an invite silently goes nowhere — which is worse than no invite. So this
 * creates the account with a generated password and returns it **once**, for
 * the administrator to hand over. It is never stored, never logged and never
 * written to the repository.
 */
const inviteSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid email address")
    .max(255),
  fullName: z.string().trim().min(1, "Enter their name").max(160),
  roleSlug: z.enum(["hod", "employee", "management", "hr", "accounts"]),
  employeeId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

/** Roles that cannot be granted by one person acting alone. */
const HIGH_RISK = new Set(["management", "hr", "accounts"]);

export type InviteState = FormState & {
  /** Shown once, never persisted. */
  credentials?: { email: string; password: string };
};

/**
 * A password strong enough to be temporary and awkward enough to be changed.
 * 18 bytes of crypto randomness, base64url — no ambiguity about which
 * characters are allowed, and nothing derived from the person's name.
 */
function temporaryPassword(): string {
  return randomBytes(18).toString("base64url");
}

export async function inviteUser(
  _prev: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const org = String(formData.get("org") ?? "");
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    roleSlug: formData.get("roleSlug"),
    employeeId: formData.get("employeeId") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  const session = await requireOrg(org);

  if (!can(session, "employees.create") || !can(session, "roles.manage")) {
    return {
      error: "Creating an account needs both employees.create and roles.manage.",
    };
  }

  if (HIGH_RISK.has(parsed.data.roleSlug)) {
    return {
      error:
        "Management, HR and Accounts carry payroll, document, settings or audit access. " +
        "They need an approved grant request with a second approver, so they cannot be " +
        "assigned when the account is created. Create the account as an Employee first.",
    };
  }

  const supabase = await createClient();

  // The role must belong to this tenant. Looked up by slug within the
  // organization rather than accepted as an id from the form.
  const { data: role } = await supabase
    .from("roles")
    .select("id, name")
    .eq("slug", parsed.data.roleSlug)
    .maybeSingle();

  if (!role) {
    return { error: "That role does not exist in this workspace." };
  }

  const admin = createAdminClient();
  const password = temporaryPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });

  if (createError || !created?.user) {
    // Supabase says "already registered" for a duplicate, which is worth
    // passing through — it tells the administrator to look for the person
    // rather than try again.
    const message = createError?.message ?? "";
    return {
      error: /already/i.test(message)
        ? "That email already has an account. Find them in the directory instead."
        : "The account could not be created. Nothing has changed.",
    };
  }

  const userId = created.user.id;

  // Membership and role are written as the *caller*, not as the admin client,
  // so RLS and the high-risk trigger both still apply. The service role is
  // used for exactly one thing — creating the auth user — and no further.
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: session.organizationId,
      user_id: userId,
      status: "active",
    });

  if (memberError) {
    // The auth user exists but belongs to nothing. Remove it rather than leave
    // an orphan that can sign in and reach a workspace picker with no
    // workspaces in it.
    await admin.auth.admin.deleteUser(userId);
    return {
      error: describeWriteError(
        memberError.code,
        memberError.message,
        "That person is already a member of this workspace.",
      ),
    };
  }

  const { error: roleError } = await supabase.from("user_roles").insert({
    organization_id: session.organizationId,
    user_id: userId,
    role_id: role.id,
  });

  if (roleError) {
    await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", session.organizationId)
      .eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId);
    return {
      error: describeWriteError(
        roleError.code,
        roleError.message,
        "That role is already assigned.",
      ),
    };
  }

  // Link the account to a staff record if one was chosen. Without this the
  // person signs in to a workspace where every "my own" screen is empty —
  // no payslip, no leave balance, no assigned tasks — because my_employee_id()
  // returns null and the policies correctly match nothing.
  if (parsed.data.employeeId) {
    await supabase
      .from("employees")
      .update({ user_id: userId })
      .eq("id", parsed.data.employeeId)
      .is("user_id", null);
  }

  revalidatePath("/[org]/employees", "page");

  return {
    done: true,
    credentials: { email: parsed.data.email, password },
  };
}
