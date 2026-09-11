"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/auth/redirect";

/**
 * Auth server actions.
 *
 * Every input is validated here, server-side, with Zod. Browser validation is
 * a convenience for the person typing; it is never the control.
 *
 * Error copy is deliberately non-committal about *which* credential was wrong.
 * Saying "no account with that email" tells an attacker which addresses are
 * worth attacking.
 */
export type AuthState = { error?: string; sent?: boolean };

const loginSchema = z.object({
  // The company code selects a workspace; it is not a credential and no
  // security is derived from it (DECISIONS.md D6).
  companyCode: z
    .string()
    .trim()
    .min(1, "Enter your company code")
    .max(64)
    .regex(/^[a-z0-9-]+$/i, "Company codes contain letters, numbers and hyphens"),
  email: z.string().trim().toLowerCase().email("Enter a valid work email"),
  password: z.string().min(1, "Enter your password"),
  next: z.string().optional(),
});

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = loginSchema.safeParse({
    companyCode: formData.get("companyCode"),
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // One message for a wrong password and for an unknown address, on purpose.
    return { error: "Those details didn't match. Check and try again." };
  }

  redirect(safeRedirect(parsed.data.next));
}

const forgotSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid work email"),
});

export async function requestReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const parsed = forgotSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your email" };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/auth/reset`,
  });

  // Reported as sent whether or not the address exists — otherwise this form
  // becomes a way to enumerate who works here.
  return { sent: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
