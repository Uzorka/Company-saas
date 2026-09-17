import { requireOrg } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { ErrorState, EmptyState } from "@/components/states";
import {
  listConversations,
  listMessages,
  listColleagues,
} from "@/lib/messages/queries";
import { markRead } from "@/lib/messages/actions";
import { ConversationList } from "./sidebar";
import { Conversation } from "./conversation";

export const metadata = { title: "Messages" };

/**
 * Messages.
 *
 * There is no permission check on this page, and that is the design rather
 * than an omission: everyone with a sign-in account can message everyone else,
 * which is what was chosen when this was built. What differs between people is
 * which conversations exist for them, and that is decided by RLS — membership,
 * and nothing else.
 *
 * Nobody outside a conversation can read it. Not Management, not the account
 * that installed the product. That promise is kept by the policies in
 * migration 0036, not by this file.
 */
export default async function MessagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);
  const { c: requested } = await searchParams;

  const [{ rows, error }, colleagues] = await Promise.all([
    listConversations(session.userId),
    listColleagues(session.userId),
  ]);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load your messages"
        body="The request failed. Your data is safe."
      />
    );
  }

  // The requested conversation, or the most recently active one you are in.
  const active =
    rows.find((r) => r.id === requested) ??
    rows.find((r) => r.joined) ??
    null;

  const { rows: messages } =
    active && active.joined
      ? await listMessages(active.id)
      : { rows: [] };

  // Opening a conversation is reading it. Done after the messages are
  // fetched, so the marker moves past what was actually shown.
  if (active?.joined && active.unread > 0) {
    await markRead(org, active.id);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1">Messages</h1>
        <p className="mt-1 max-w-[70ch] text-body text-text-2">
          Channels are open to everyone here. A direct message is readable only
          by the people in it — no administrator can open one, and nothing sent
          can be edited or deleted.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <ConversationList
          org={org}
          rows={rows}
          colleagues={colleagues}
          activeId={active?.id ?? null}
        />

        {active ? (
          <Conversation
            org={org}
            conversation={active}
            messages={messages}
            me={session.userId}
          />
        ) : (
          <EmptyState
            heading="No conversations yet"
            body="Start a channel for a team, or message a colleague directly. Channels are visible to everyone in the workspace; direct messages are not."
          />
        )}
      </div>
    </div>
  );
}
