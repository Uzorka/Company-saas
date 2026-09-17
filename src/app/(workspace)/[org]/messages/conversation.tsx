"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Hash, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/status-pill";
import { sendMessage, joinChannel } from "@/lib/messages/actions";
import type { FormState } from "@/lib/forms/result";
import type { ConversationRow, MessageRow } from "@/lib/messages/queries";

/**
 * One conversation, open.
 *
 * Messages arrive by polling rather than a live socket. That is a deliberate
 * trade at this size: Supabase Realtime would need the table published and a
 * subscription whose authorisation has to be reasoned about separately from
 * the policies, and a ten-second poll on a page you have open is indistinguish-
 * able from live for an internal tool. It is also the version that keeps
 * working when a driver's connection drops and comes back.
 */
export function Conversation({
  org,
  conversation,
  messages,
  me,
}: {
  org: string;
  conversation: ConversationRow;
  messages: MessageRow[];
  me: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  // Follow the conversation down as it grows, the way every messaging app
  // does. `auto` rather than `smooth`: on first open you want to be at the
  // bottom, not watching it travel there.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    if (!conversation.joined) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [router, conversation.joined]);

  function submit(formData: FormData) {
    formData.set("org", org);
    formData.set("conversationId", conversation.id);
    setState({});
    startTransition(async () => {
      const result = await sendMessage({}, formData);
      setState(result);
      if (result.done) {
        formRef.current?.reset();
        router.refresh();
      }
    });
  }

  function join() {
    const formData = new FormData();
    formData.set("org", org);
    formData.set("conversationId", conversation.id);
    startTransition(async () => {
      const result = await joinChannel({}, formData);
      setState(result);
      if (result.done) router.refresh();
    });
  }

  return (
    <section className="flex min-h-[60vh] flex-col rounded-xl border border-border bg-bg">
      <header className="flex flex-wrap items-center gap-2 border-b border-border p-4">
        {conversation.kind === "channel" ? (
          <Hash className="size-4 text-text-3" aria-hidden />
        ) : (
          <UserRound className="size-4 text-text-3" aria-hidden />
        )}
        <h2 className="text-h3">{conversation.title}</h2>
        {conversation.kind === "direct" ? (
          <StatusPill tone="mute">Private</StatusPill>
        ) : null}
        {conversation.topic ? (
          <p className="w-full text-small text-text-2">{conversation.topic}</p>
        ) : null}
      </header>

      {conversation.joined ? (
        <>
          <ol className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <li className="m-auto text-center text-small text-text-3">
                Nothing here yet. Say something.
              </li>
            ) : (
              messages.map((message, index) => {
                const mine = message.author_id === me;
                const previous = messages[index - 1];
                // Consecutive messages from one person read as one turn.
                const grouped =
                  previous?.author_id === message.author_id &&
                  new Date(message.created_at).getTime() -
                    new Date(previous.created_at).getTime() <
                    5 * 60_000;

                return (
                  <li key={message.id} className="flex gap-3">
                    <span className="w-8 shrink-0">
                      {grouped ? null : (
                        <Avatar name={message.authorName} size="md" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      {grouped ? null : (
                        <p className="text-small">
                          <span className="font-medium">
                            {mine ? "You" : message.authorName}
                          </span>
                          <span className="ml-2 text-text-3">
                            {new Date(message.created_at).toLocaleString("en-GB", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </p>
                      )}
                      <p className="whitespace-pre-wrap break-words text-body text-text-2">
                        {message.body}
                      </p>
                    </div>
                  </li>
                );
              })
            )}
            <div ref={endRef} />
          </ol>

          <form
            ref={formRef}
            action={submit}
            className="flex flex-col gap-2 border-t border-border p-4"
          >
            {state.error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-2.5 text-small text-danger-fg"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {state.error}
              </p>
            ) : null}

            <label htmlFor="body" className="sr-only">
              Message {conversation.title}
            </label>
            <Textarea
              id="body"
              name="body"
              rows={2}
              required
              maxLength={4000}
              placeholder={`Message ${conversation.title}`}
              onKeyDown={(event) => {
                // Enter sends, Shift+Enter starts a line. What everyone's
                // fingers already expect.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-small text-text-3">
                Sent messages cannot be edited or deleted.
              </p>
              <Button type="submit" size="sm" loading={pending}>
                <Send aria-hidden />
                Send
              </Button>
            </div>
          </form>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-[46ch] text-body text-text-2">
            You can see that <strong>{conversation.title}</strong> exists, and
            you have not joined it. Its messages stay unreadable until you do.
          </p>
          {state.error ? (
            <p role="alert" className="text-small text-danger-fg">
              {state.error}
            </p>
          ) : null}
          <Button onClick={join} loading={pending}>
            Join {conversation.title}
          </Button>
        </div>
      )}
    </section>
  );
}
