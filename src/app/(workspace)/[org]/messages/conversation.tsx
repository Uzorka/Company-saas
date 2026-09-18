"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Bell,
  BellOff,
  Hash,
  Paperclip,
  Palette,
  Send,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/status-pill";
import {
  sendMessage,
  joinChannel,
  sendAttachment,
  createUploadTicket,
  setTyping,
  whoIsTyping,
} from "@/lib/messages/actions";
import { MAX_ATTACHMENT_BYTES } from "@/lib/messages/limits";
import { createClient as createBrowserClient } from "@/lib/supabase/client";
import {
  primeTone,
  playTone,
  setToneEnabled,
  subscribeToTone,
  toneSnapshot,
  toneServerSnapshot,
} from "@/lib/messages/tone";
import {
  themeStyles,
  layoutStyles,
  isTheme,
  isLayout,
  type Theme,
  type Layout,
} from "@/lib/messages/appearance";
import type { FormState } from "@/lib/forms/result";
import type { ConversationRow, MessageRow } from "@/lib/messages/queries";
import { cn } from "@/lib/utils";
import { Attachment, fileSize } from "./attachment";
import { AppearancePanel } from "./appearance-panel";
import { MembersPanel } from "./members-panel";

/**
 * One conversation, open.
 *
 * Laid out the way every messaging app people already use is laid out: your
 * own words on the right in a solid colour, everyone else's on the left in a
 * light one. That is not decoration — it is how you find your own last message
 * in a scroll without reading any of it.
 *
 * Messages arrive by polling rather than a live socket, which is a deliberate
 * trade at this size. Supabase Realtime would need the table published and a
 * subscription whose authorisation has to be reasoned about separately from
 * the policies that already decide everything; a short poll on a page you have
 * open is indistinguishable from live for an internal tool, and it is the
 * version that keeps working when a driver's connection drops and comes back.
 */
export function Conversation({
  org,
  conversation,
  messages,
  me,
  colleagues,
}: {
  org: string;
  conversation: ConversationRow;
  messages: MessageRow[];
  me: string;
  colleagues: { id: string; name: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [typing, setTypingNames] = useState<string[]>([]);
  const [panel, setPanel] = useState<"appearance" | "members" | null>(null);
  const sound = useSyncExternalStore(
    subscribeToTone,
    toneSnapshot,
    toneServerSnapshot,
  );

  const theme: Theme = isTheme(conversation.theme) ? conversation.theme : "default";
  const layout: Layout = isLayout(conversation.layout)
    ? conversation.layout
    : "comfortable";
  const look = themeStyles[theme];
  const density = layoutStyles[layout];

  // Follow the conversation down as it grows. `auto` rather than `smooth`: on
  // open you want to be at the bottom, not watching it travel there.
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  // A new message from someone else, while this tab is open, is the only
  // thing that should make a sound.
  const previousCount = useRef(messages.length);
  useEffect(() => {
    const last = messages[messages.length - 1];
    if (
      messages.length > previousCount.current &&
      last &&
      last.author_id !== me &&
      sound
    ) {
      playTone();
    }
    previousCount.current = messages.length;
  }, [messages, me, sound]);

  useEffect(() => {
    if (!conversation.joined) return;
    const timer = setInterval(() => router.refresh(), 8_000);
    return () => clearInterval(timer);
  }, [router, conversation.joined]);

  // Typing is polled faster than messages and costs almost nothing: one row
  // per person actually typing, and the function clears its own stale rows.
  useEffect(() => {
    if (!conversation.joined) return;
    let alive = true;
    const poll = async () => {
      const names = await whoIsTyping(org, conversation.id);
      if (alive) setTypingNames(names);
    };
    void poll();
    const timer = setInterval(poll, 2_500);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [org, conversation.id, conversation.joined]);

  // Announce typing at most every two seconds, however fast someone types.
  const lastAnnounced = useRef(0);
  const announceTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastAnnounced.current < 2_000) return;
    lastAnnounced.current = now;
    void setTyping(org, conversation.id);
  }, [org, conversation.id]);

  function chooseFile(file: File | null) {
    setState({});
    if (!file) return setPendingFile(null);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      setState({ error: "That file is larger than 25 MB." });
      return setPendingFile(null);
    }
    setPendingFile(file);
  }

  /**
   * Send. A file goes to storage first, directly from the browser — a 25 MB
   * video routed through a serverless function would meet a request body limit
   * and a timeout for no benefit — and the message is recorded once it lands.
   */
  function submit(formData: FormData) {
    const body = String(formData.get("body") ?? "");
    const file = pendingFile;
    if (!body.trim() && !file) return;

    setState({});
    startTransition(async () => {
      if (file) {
        setUploading(true);
        const ticket = await createUploadTicket(
          org,
          conversation.id,
          file.name,
          file.type || "application/octet-stream",
          file.size,
        );

        if (!ticket.ok) {
          setUploading(false);
          setState({ error: ticket.error });
          return;
        }

        const supabase = createBrowserClient();
        const { error } = await supabase.storage
          .from("message-attachments")
          .uploadToSignedUrl(ticket.path, ticket.token, file);

        setUploading(false);

        if (error) {
          setState({ error: "That file could not be uploaded. Try again." });
          return;
        }

        const payload = new FormData();
        payload.set("org", org);
        payload.set("conversationId", conversation.id);
        payload.set("body", body);
        payload.set("path", ticket.path);
        payload.set("name", file.name);
        payload.set("type", file.type || "application/octet-stream");
        payload.set("size", String(file.size));

        const result = await sendAttachment({}, payload);
        setState(result);
        if (result.done) {
          setPendingFile(null);
          if (fileRef.current) fileRef.current.value = "";
          formRef.current?.reset();
          router.refresh();
        }
        return;
      }

      formData.set("org", org);
      formData.set("conversationId", conversation.id);
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

  const busy = pending || uploading;

  return (
    <section
      className="flex min-h-[62vh] flex-col overflow-hidden rounded-xl border border-border bg-bg"
      onPointerDown={primeTone}
      onKeyDown={primeTone}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-bg p-4">
        {conversation.kind === "channel" ? (
          <Hash className="size-4 text-text-3" aria-hidden />
        ) : (
          <UserRound className="size-4 text-text-3" aria-hidden />
        )}
        <h2 className="text-h3">{conversation.title}</h2>
        {conversation.kind === "direct" ? (
          <StatusPill tone="mute">Private</StatusPill>
        ) : (
          <span className="text-small text-text-3">
            {conversation.memberIds.length}{" "}
            {conversation.memberIds.length === 1 ? "member" : "members"}
          </span>
        )}

        <span className="ml-auto flex items-center gap-1">
          <IconButton
            label={sound ? "Turn the arrival tone off" : "Turn the arrival tone on"}
            size="sm"
            icon={sound ? <Bell aria-hidden /> : <BellOff aria-hidden />}
            onClick={() => {
              primeTone();
              const next = !sound;
              setToneEnabled(next);
              if (next) playTone();
            }}
          />
          {conversation.kind === "channel" && conversation.joined ? (
            <IconButton
              label="People in this channel"
              size="sm"
              icon={<UserRoundPlus aria-hidden />}
              onClick={() => setPanel("members")}
            />
          ) : null}
          {conversation.joined ? (
            <IconButton
              label="Change how this conversation looks"
              size="sm"
              icon={<Palette aria-hidden />}
              onClick={() => setPanel("appearance")}
            />
          ) : null}
        </span>

        {conversation.topic ? (
          <p className="w-full text-small text-text-2">{conversation.topic}</p>
        ) : null}
      </header>

      {conversation.joined ? (
        <>
          <ol
            className={cn(
              "flex flex-1 flex-col overflow-y-auto p-4",
              density.gap,
              look.surface,
            )}
          >
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
                  <li
                    key={message.id}
                    className={cn(
                      "flex max-w-full gap-2",
                      mine ? "flex-row-reverse self-end" : "self-start",
                      grouped ? "mt-0" : "mt-2 first:mt-0",
                    )}
                  >
                    {/* Only on other people's messages, and only on the first
                        of a run: your own face beside your own words is noise. */}
                    <span className="w-8 shrink-0">
                      {mine || grouped ? null : (
                        <Avatar name={message.authorName} size="md" />
                      )}
                    </span>

                    <div
                      className={cn(
                        "min-w-0 max-w-[min(34rem,78%)] rounded-xl shadow-e1",
                        density.bubble,
                        mine ? look.mine : look.theirs,
                      )}
                    >
                      {/* In a channel you need to know who is speaking. In a
                          direct message there are only two of you. */}
                      {grouped || mine || conversation.kind === "direct" ? null : (
                        <p className="mb-0.5 text-small font-semibold">
                          {message.authorName}
                        </p>
                      )}

                      {message.body ? (
                        <p
                          className={cn(
                            "whitespace-pre-wrap break-words",
                            density.text,
                          )}
                        >
                          {message.body}
                        </p>
                      ) : null}

                      <Attachment message={message} mine={mine} />

                      <p
                        className={cn(
                          "mt-1 text-right text-[11px]",
                          mine ? "text-white/70" : "text-text-3",
                        )}
                      >
                        {new Date(message.created_at).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </li>
                );
              })
            )}
            <div ref={endRef} />
          </ol>

          {typing.length > 0 ? (
            <p
              className="flex items-center gap-2 border-t border-border px-4 py-1.5 text-small text-text-3"
              aria-live="polite"
            >
              <span className="flex gap-0.5" aria-hidden>
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-1.5 animate-typing-dot rounded-pill bg-text-3"
                    style={{ animationDelay: `${dot * 0.16}s` }}
                  />
                ))}
              </span>
              {typing.length === 1
                ? `${typing[0]} is typing`
                : `${typing.slice(0, 2).join(" and ")} are typing`}
            </p>
          ) : null}

          <form
            ref={formRef}
            action={submit}
            className="flex flex-col gap-2 border-t border-border bg-bg p-4"
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

            {pendingFile ? (
              <p className="flex items-center gap-2 rounded-lg border border-border bg-surface p-2.5 text-small">
                <Paperclip className="size-4 shrink-0 text-text-3" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {pendingFile.name}
                  <span className="ml-2 text-text-3">{fileSize(pendingFile.size)}</span>
                </span>
                <IconButton
                  label="Remove this file"
                  size="sm"
                  icon={<X aria-hidden />}
                  onClick={() => {
                    setPendingFile(null);
                    if (fileRef.current) fileRef.current.value = "";
                  }}
                />
              </p>
            ) : null}

            <div className="flex items-end gap-2">
              <input
                ref={fileRef}
                type="file"
                className="sr-only"
                id="attachment"
                accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              />
              <label
                htmlFor="attachment"
                className="grid size-[38px] shrink-0 cursor-pointer place-items-center rounded-md border border-border-hi bg-bg text-text-2 transition-colors hover:bg-surface"
              >
                <Paperclip className="size-[18px]" aria-hidden />
                <span className="sr-only">Attach a file</span>
              </label>

              <label htmlFor="body" className="sr-only">
                Message {conversation.title}
              </label>
              <Textarea
                id="body"
                name="body"
                rows={1}
                maxLength={4000}
                placeholder={`Message ${conversation.title}`}
                className="min-h-[38px] resize-none py-2"
                onInput={announceTyping}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter starts a line. What everyone's
                  // fingers already expect.
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    event.currentTarget.form?.requestSubmit();
                  }
                }}
              />

              <Button type="submit" loading={busy} className="shrink-0">
                <Send aria-hidden />
                <span className="sr-only sm:not-sr-only">
                  {uploading ? "Sending…" : "Send"}
                </span>
              </Button>
            </div>

            <p className="text-small text-text-3">
              Sent messages cannot be edited or deleted. Files up to 25 MB.
            </p>
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

      <AppearancePanel
        org={org}
        conversationId={conversation.id}
        open={panel === "appearance"}
        onClose={() => setPanel(null)}
        theme={theme}
        layout={layout}
      />

      <MembersPanel
        org={org}
        conversation={conversation}
        colleagues={colleagues}
        open={panel === "members"}
        onClose={() => setPanel(null)}
      />
    </section>
  );
}
