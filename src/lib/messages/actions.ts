"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrg } from "@/lib/auth/session";
import { type FormState, humanise } from "@/lib/forms/result";
import { randomUUID } from "node:crypto";
import { THEMES, LAYOUTS } from "./appearance";
import { MAX_ATTACHMENT_BYTES } from "./limits";

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
  // Checked again in the database against active membership of this
  // workspace, so a hand-edited form cannot put an outsider in the room.
  participants: z.array(z.string().uuid()).max(200),
});

export async function createChannel(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = channelSchema.safeParse({
    name: formData.get("name"),
    topic: formData.get("topic") ?? "",
    participants: formData
      .getAll("participants")
      .map(String)
      .filter((value) => /^[0-9a-f-]{36}$/i.test(value)),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the details." };
  }

  await requireOrg(org);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("create_channel", {
    p_name: parsed.data.name,
    p_topic: parsed.data.topic || null,
    p_participants: parsed.data.participants,
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

// ---------------------------------------------------------------------------
// Attachments, typing and appearance
// ---------------------------------------------------------------------------


/**
 * What a file is allowed to be.
 *
 * An allowlist, not a blocklist. The browser reports the type and the browser
 * can be lying, so this is not a security boundary on its own — the file is
 * served from a private bucket through a signed URL and is never executed by
 * anything. What it does is stop the obvious mistakes reaching a colleague's
 * download folder, and keep the preview code honest about what it may render.
 */
const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic",
  "video/mp4", "video/quicktime", "video/webm",
  "application/pdf",
  "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
];

export type UploadTicket =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string };

/**
 * Permission to put one file in one place.
 *
 * The browser uploads directly to storage rather than through this server: a
 * 25 MB video would otherwise pass through a serverless function with a
 * request body limit and a timeout, for no benefit. What the server does is
 * decide the path — `<org>/<conversation>/<uuid>-<name>` — so the caller never
 * chooses where their file lands, and `send_message` checks the same two
 * segments again when the message is written.
 *
 * The filename is sanitised because it becomes part of an object key and,
 * later, a download filename.
 */
export async function createUploadTicket(
  org: string,
  conversationId: string,
  fileName: string,
  fileType: string,
  fileSize: number,
): Promise<UploadTicket> {
  const session = await requireOrg(org);

  if (!z.string().uuid().safeParse(conversationId).success) {
    return { ok: false, error: "That conversation could not be found." };
  }
  if (fileSize > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "That file is larger than 25 MB." };
  }
  if (fileSize <= 0) {
    return { ok: false, error: "That file is empty." };
  }
  if (!ALLOWED_TYPES.includes(fileType)) {
    return {
      ok: false,
      error: "That kind of file can't be sent here. Images, video, PDFs and Office documents can.",
    };
  }

  const supabase = await createClient();

  // Membership, asked of the database rather than assumed. A ticket for a
  // conversation you are not in would write a file into someone else's room.
  const { data: member } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  if (!member) return { ok: false, error: "You are not in that conversation." };

  const safeName =
    fileName
      .replace(/[^\w.\- ]/g, "")
      .replace(/\s+/g, "-")
      .slice(-80) || "file";

  const path = `${session.organizationId}/${conversationId}/${randomUUID()}-${safeName}`;

  const { data, error } = await supabase.storage
    .from("message-attachments")
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("messages: could not create an upload ticket", error?.message);
    return { ok: false, error: "That upload could not be started." };
  }

  return { ok: true, path: data.path, token: data.token };
}

/** A short-lived link to one attachment, for someone who may read it. */
export async function attachmentUrl(
  org: string,
  path: string,
): Promise<string | null> {
  await requireOrg(org);
  const supabase = await createClient();

  // The bucket policy already requires membership of the conversation named in
  // the path's second segment, so a signed URL is only issued for a file the
  // caller may actually read.
  const { data, error } = await supabase.storage
    .from("message-attachments")
    .createSignedUrl(path, 60 * 10);

  if (error) {
    console.error("messages: could not sign an attachment", error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

const attachmentSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().max(4000).optional().or(z.literal("")),
  path: z.string().min(1).max(500),
  name: z.string().min(1).max(200),
  type: z.string().min(1).max(120),
  size: z.coerce.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
});

/** Record a message for a file that is already in storage. */
export async function sendAttachment(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = attachmentSchema.safeParse({
    conversationId: formData.get("conversationId"),
    body: formData.get("body") ?? "",
    path: formData.get("path"),
    name: formData.get("name"),
    type: formData.get("type"),
    size: formData.get("size"),
  });

  if (!parsed.success) return { error: "That file could not be sent." };

  await requireOrg(org);
  const supabase = await createClient();

  const { error } = await supabase.rpc("send_message", {
    p_conversation: parsed.data.conversationId,
    p_body: parsed.data.body || null,
    p_attachment_path: parsed.data.path,
    p_attachment_name: parsed.data.name,
    p_attachment_type: parsed.data.type,
    p_attachment_size: parsed.data.size,
  });

  if (error) return { error: humanise(error.message) };

  revalidatePath("/[org]/messages", "page");
  return { done: true };
}

/** Say you are typing. Deliberately returns nothing and never throws. */
export async function setTyping(org: string, conversationId: string): Promise<void> {
  await requireOrg(org);
  const supabase = await createClient();
  await supabase.rpc("set_typing", { p_conversation: conversationId });
}

/** Who else is typing, by name. */
export async function whoIsTyping(
  org: string,
  conversationId: string,
): Promise<string[]> {
  await requireOrg(org);
  const supabase = await createClient();

  const { data } = await supabase.rpc("typing_in_conversation", {
    p_conversation: conversationId,
  });

  const ids = ((data ?? []) as string[]).filter(Boolean);
  if (ids.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("full_name")
    .in("id", ids);

  return (profiles ?? []).map((p) => p.full_name as string);
}

const appearanceSchema = z.object({
  conversationId: z.string().uuid(),
  theme: z.enum(THEMES),
  layout: z.enum(LAYOUTS),
});

export async function setAppearance(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = appearanceSchema.safeParse({
    conversationId: formData.get("conversationId"),
    theme: formData.get("theme"),
    layout: formData.get("layout"),
  });

  if (!parsed.success) return { error: "That look isn't one of the options." };

  await requireOrg(org);
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_conversation_appearance", {
    p_conversation: parsed.data.conversationId,
    p_theme: parsed.data.theme,
    p_layout: parsed.data.layout,
  });

  if (error) return { error: humanise(error.message) };

  revalidatePath("/[org]/messages", "page");
  return { done: true };
}

const addMemberSchema = z.object({
  conversationId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function addToChannel(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const org = String(formData.get("org") ?? "");
  const parsed = addMemberSchema.safeParse({
    conversationId: formData.get("conversationId"),
    userId: formData.get("userId"),
  });
  if (!parsed.success) return { error: "Choose someone to add." };

  await requireOrg(org);
  const supabase = await createClient();

  const { error } = await supabase.rpc("add_to_channel", {
    p_conversation: parsed.data.conversationId,
    p_user: parsed.data.userId,
  });

  if (error) return { error: humanise(error.message) };

  revalidatePath("/[org]/messages", "page");
  return { done: true };
}
