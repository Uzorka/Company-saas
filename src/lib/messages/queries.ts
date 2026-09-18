import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Reading conversations.
 *
 * Nothing here filters by who you are. RLS does that — `messages_read` needs
 * membership and nothing else, so Management running the same query as an
 * employee gets their own conversations and no more. That is the product's
 * promise to staff, and it is kept one layer below this file.
 */

export type ConversationRow = {
  id: string;
  kind: "channel" | "direct";
  name: string | null;
  topic: string | null;
  last_message_at: string;
  /** Filled in for direct messages, where the other person is the name. */
  title: string;
  memberIds: string[];
  memberNames: string[];
  unread: number;
  joined: boolean;
  /** This person's own view of the room. Nobody else's changes with it. */
  theme: string;
  layout: string;
};

export type MessageRow = {
  id: string;
  body: string | null;
  created_at: string;
  author_id: string;
  authorName: string;
  attachment_path: string | null;
  attachment_name: string | null;
  attachment_type: string | null;
  attachment_size: number | null;
  /** Signed, short-lived, and only issued to someone who may read it. */
  attachmentUrl: string | null;
};

async function namesFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);
  for (const p of data ?? []) names.set(p.id as string, p.full_name as string);
  return names;
}

/**
 * Every conversation this person can see, newest activity first.
 *
 * Channels they have not joined are included: a channel is discoverable by
 * design, and one you cannot see is one nobody ever joins. Its messages stay
 * unreadable until they do — `joined` is what the screen uses to offer the
 * difference.
 */
export async function listConversations(
  me: string,
): Promise<{ rows: ConversationRow[]; error: boolean }> {
  const supabase = await createClient();

  const [{ data: conversations, error }, { data: memberships }] =
    await Promise.all([
      supabase
        .from("conversations")
        .select("id, kind, name, topic, last_message_at")
        .order("last_message_at", { ascending: false })
        .limit(200),
      supabase
        .from("conversation_members")
        .select("conversation_id, user_id, last_read_at, theme, layout"),
    ]);

  if (error) {
    console.error("messages: conversations query failed", error.message, error.code);
    return { rows: [], error: true };
  }

  const byConversation = new Map<
    string,
    {
      members: string[];
      myLastRead: string | null;
      theme: string;
      layout: string;
    }
  >();
  for (const m of memberships ?? []) {
    const key = m.conversation_id as string;
    const entry = byConversation.get(key) ?? {
      members: [],
      myLastRead: null,
      theme: "default",
      layout: "comfortable",
    };
    entry.members.push(m.user_id as string);
    if (m.user_id === me) {
      entry.myLastRead = m.last_read_at as string;
      entry.theme = (m.theme as string) ?? "default";
      entry.layout = (m.layout as string) ?? "comfortable";
    }
    byConversation.set(key, entry);
  }

  // One count for every conversation, rather than a query each. Only messages
  // after the caller's own read marker are counted, and RLS has already
  // removed anything they cannot read.
  const { data: recent } = await supabase
    .from("messages")
    .select("conversation_id, created_at, author_id")
    .order("created_at", { ascending: false })
    .limit(1000);

  const names = await namesFor(
    supabase,
    [...new Set((memberships ?? []).map((m) => m.user_id as string))],
  );

  const rows: ConversationRow[] = (conversations ?? []).map((c) => {
    const id = c.id as string;
    const entry = byConversation.get(id) ?? {
      members: [],
      myLastRead: null,
      theme: "default",
      layout: "comfortable",
    };
    const joined = entry.members.includes(me);

    const unread = joined
      ? (recent ?? []).filter(
          (m) =>
            m.conversation_id === id &&
            m.author_id !== me &&
            (!entry.myLastRead ||
              (m.created_at as string) > entry.myLastRead),
        ).length
      : 0;

    const others = entry.members.filter((u) => u !== me);
    const title =
      c.kind === "channel"
        ? `#${c.name as string}`
        : others.map((u) => names.get(u) ?? "Unknown").join(", ") ||
          "Just you";

    return {
      id,
      kind: c.kind as "channel" | "direct",
      name: (c.name as string | null) ?? null,
      topic: (c.topic as string | null) ?? null,
      last_message_at: c.last_message_at as string,
      title,
      memberIds: entry.members,
      memberNames: entry.members.map((u) => names.get(u) ?? "Unknown"),
      unread,
      joined,
      theme: entry.theme,
      layout: entry.layout,
    };
  });

  return { rows, error: false };
}

/** The messages in one conversation, oldest first — it reads downwards. */
export async function listMessages(
  conversationId: string,
): Promise<{ rows: MessageRow[]; error: boolean }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("messages")
    .select(
      `id, body, created_at, author_id, attachment_path, attachment_name,
       attachment_type, attachment_size`,
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.error("messages: message query failed", error.message, error.code);
    return { rows: [], error: true };
  }

  const rows = (data ?? []) as MessageRow[];
  const names = await namesFor(
    supabase,
    [...new Set(rows.map((r) => r.author_id))],
  );

  // One signed URL per attachment, issued together rather than per render.
  // The bucket policy requires membership of the conversation in the path, so
  // a URL is only produced for a file this caller may actually read.
  const signed = new Map<string, string>();
  const paths = rows
    .map((r) => r.attachment_path)
    .filter((p): p is string => typeof p === "string");

  if (paths.length > 0) {
    const { data: urls } = await supabase.storage
      .from("message-attachments")
      .createSignedUrls(paths, 60 * 10);
    for (const entry of urls ?? []) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }

  return {
    rows: rows.map((r) => ({
      ...r,
      authorName: names.get(r.author_id) ?? "Unknown",
      attachmentUrl: r.attachment_path
        ? (signed.get(r.attachment_path) ?? null)
        : null,
    })),
    error: false,
  };
}

/** Colleagues who can be messaged. RLS scopes it to this workspace. */
export async function listColleagues(
  me: string,
): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("status", "active");

  const ids = (members ?? [])
    .map((m) => m.user_id as string)
    .filter((id) => id !== me);

  const names = await namesFor(supabase, ids);
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
