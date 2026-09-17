"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/session";
import { type FormState, humanise } from "@/lib/forms/result";

/**
 * Sending, starting and joining.
 *
 * Thin over the database functions, as everywhere else in this codebase. The
 * rules that matter — you may only post where you are a member, only as
 * yourself, and nobody may edit or delete afterwards — are policies on
 * `messages`, not checks here. There is deliberately no permission gate in
 * this file beyond being signed in to the workspace: every employee can
 * message every colleague, which was the choice made when this was designed.
 */

const sendSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1, "Write something first").max(4000),
});

export async function sendMessage(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = sendSchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Write something first" };
  }

  await requireOrg(org);
  const supabase = await createClient();

  const { error } = await supabase.rpc("send_message", {
    p_conversation: parsed.data.conversationId,
    p_body: parsed.data.body,
  });

  if (error) return { error: humanise(error.message) };

  revalidatePath("/[org]/messages", "page");
  return { done: true };
}

const channelSchema = z.object({
  name: z.string().trim().min(2, "A channel name needs at least two characters").max(80),
  topic: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function createChannel(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = channelSchema.safeParse({
    name: formData.get("name"),
    topic: formData.get("topic") ?? "",
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  await requireOrg(org);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_channel", {
    p_name: parsed.data.name,
    p_topic: parsed.data.topic || null,
  });

  if (error) return { error: humanise(error.message) };

  revalidatePath("/[org]/messages", "page");
  return { done: true, id: (data as { id?: string } | null)?.id };
}

const directSchema = z.object({ userId: z.string().uuid() });

export async function openDirectMessage(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = directSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) return { error: "Choose someone to message." };

  await requireOrg(org);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("open_direct_message", {
    p_other_user: parsed.data.userId,
  });

  if (error) return { error: humanise(error.message) };

  revalidatePath("/[org]/messages", "page");
  return { done: true, id: (data as { id?: string } | null)?.id };
}

const joinSchema = z.object({ conversationId: z.string().uuid() });

export async function joinChannel(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = joinSchema.safeParse({
    conversationId: formData.get("conversationId"),
  });
  if (!parsed.success) return { error: "That channel could not be found." };

  const session = await requireOrg(org);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("conversation_members")
    .insert({
      conversation_id: parsed.data.conversationId,
      user_id: session.userId,
      organization_id: session.organizationId,
    })
    .select("conversation_id");

  if (error) return { error: humanise(error.message) };
  if (!data || data.length === 0) {
    return { error: "You can't join that conversation." };
  }

  revalidatePath("/[org]/messages", "page");
  return { done: true, id: parsed.data.conversationId };
}

/** Clear the unread marker. Yours only — the policy allows nothing else. */
export async function markRead(org: string, conversationId: string): Promise<void> {
  await requireOrg(org);
  const supabase = await createClient();
  await supabase.rpc("mark_conversation_read", { p_conversation: conversationId });
  revalidatePath("/[org]/messages", "page");
}
