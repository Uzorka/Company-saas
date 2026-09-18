"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Hash, Plus, UserRound, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/ui/slide-over";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createChannel, openDirectMessage } from "@/lib/messages/actions";
import type { FormState } from "@/lib/forms/result";
import type { ConversationRow } from "@/lib/messages/queries";
import { cn } from "@/lib/utils";

/** The conversation list, and the two ways to start a new one. */
export function ConversationList({
  org,
  rows,
  colleagues,
  activeId,
}: {
  org: string;
  rows: ConversationRow[];
  colleagues: { id: string; name: string }[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<"channel" | "direct" | null>(null);
  const [state, setState] = useState<FormState>({});
  const [chosen, setChosen] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function run(
    action: (prev: FormState, data: FormData) => Promise<FormState>,
    formData: FormData,
  ) {
    formData.set("org", org);
    setState({});
    startTransition(async () => {
      const result = await action({}, formData);
      setState(result);
      if (result.done) {
        setPanel(null);
        setChosen([]);
        router.push(`/${org}/messages${result.id ? `?c=${result.id}` : ""}`);
        router.refresh();
      }
    });
  }

  const channels = rows.filter((r) => r.kind === "channel");
  const directs = rows.filter((r) => r.kind === "direct");

  return (
    <nav className="flex flex-col gap-4" aria-label="Conversations">
      <Group
        title="Channels"
        action={
          <Button size="sm" variant="ghost" onClick={() => setPanel("channel")}>
            <Plus aria-hidden />
            <span className="sr-only">New channel</span>
          </Button>
        }
      >
        {channels.length === 0 ? (
          <Empty>No channels yet.</Empty>
        ) : (
          channels.map((row) => (
            <Item key={row.id} org={org} row={row} active={row.id === activeId}>
              <Hash className="size-4 shrink-0 text-text-3" aria-hidden />
            </Item>
          ))
        )}
      </Group>

      <Group
        title="Direct messages"
        action={
          <Button size="sm" variant="ghost" onClick={() => setPanel("direct")}>
            <Plus aria-hidden />
            <span className="sr-only">New direct message</span>
          </Button>
        }
      >
        {directs.length === 0 ? (
          <Empty>No conversations yet.</Empty>
        ) : (
          directs.map((row) => (
            <Item key={row.id} org={org} row={row} active={row.id === activeId}>
              <UserRound className="size-4 shrink-0 text-text-3" aria-hidden />
            </Item>
          ))
        )}
      </Group>

      <SlideOver
        open={panel === "channel"}
        onClose={() => setPanel(null)}
        title="New channel"
        subtitle="Anyone in the workspace can find it and join. Nothing in a channel is private."
      >
        <form action={(d) => run(createChannel, d)} className="flex flex-col gap-4">
          <Field
            label="Name"
            htmlFor="name"
            hint="Becomes a handle — spaces turn into dashes, capitals into lower case."
            required
          >
            <Input id="name" name="name" placeholder="sales-lagos" required minLength={2} />
          </Field>
          <Field label="What it is for" htmlFor="topic">
            <Textarea id="topic" name="topic" rows={2} placeholder="Depot coordination" />
          </Field>

          {/* Everyone ticked is added when the channel is made. Anyone in the
              workspace can find and join it afterwards regardless — this saves
              six people a search, rather than granting reach they lacked. */}
          <fieldset>
            <legend className="text-small font-medium">
              Add people
              <span className="ml-2 font-normal text-text-3">
                {chosen.length > 0 ? `${chosen.length} selected` : "optional"}
              </span>
            </legend>

            {colleagues.length === 0 ? (
              <p className="mt-2 text-small text-text-2">
                Nobody else has a sign-in account yet.
              </p>
            ) : (
              <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
                {colleagues.map((person) => (
                  <li key={person.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 rounded-md p-1.5 text-small hover:bg-surface">
                      <input
                        type="checkbox"
                        name="participants"
                        value={person.id}
                        checked={chosen.includes(person.id)}
                        onChange={(event) =>
                          setChosen((current) =>
                            event.target.checked
                              ? [...current, person.id]
                              : current.filter((id) => id !== person.id),
                          )
                        }
                        className="size-4 accent-brand-600"
                      />
                      {person.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {state.error ? <Problem>{state.error}</Problem> : null}
          <Button type="submit" loading={pending}>
            Create channel
          </Button>
        </form>
      </SlideOver>

      <SlideOver
        open={panel === "direct"}
        onClose={() => setPanel(null)}
        title="New message"
        subtitle="Only the two of you can read it. Not Management, not an administrator — nobody."
      >
        <form action={(d) => run(openDirectMessage, d)} className="flex flex-col gap-4">
          <Field label="Who" htmlFor="userId" required>
            <Select id="userId" name="userId" required defaultValue="">
              <option value="">Choose a colleague</option>
              {colleagues.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>
          {colleagues.length === 0 ? (
            <p className="text-small text-text-2">
              Nobody else has a sign-in account yet. Accounts are created from
              Employees.
            </p>
          ) : null}
          {state.error ? <Problem>{state.error}</Problem> : null}
          <Button type="submit" loading={pending} disabled={colleagues.length === 0}>
            Start the conversation
          </Button>
        </form>
      </SlideOver>
    </nav>
  );
}

function Group({
  title,
  action,
  children,
}: {
  title: string;
  action: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className="text-overline text-text-3">{title}</h2>
        {action}
      </div>
      <ul className="mt-1 flex flex-col gap-0.5">{children}</ul>
    </div>
  );
}

function Item({
  org,
  row,
  active,
  children,
}: {
  org: string;
  row: ConversationRow;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={`/${org}/messages?c=${row.id}`}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-small",
          "transition-colors duration-(--duration-instant) ease-(--ease-standard)",
          active ? "bg-brand-50 text-brand-700" : "text-text-2 hover:bg-canvas",
        )}
      >
        {children}
        <span className="min-w-0 flex-1 truncate">{row.title}</span>
        {row.unread > 0 ? (
          <span
            className="rounded-pill bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold text-white"
            aria-label={`${row.unread} unread`}
          >
            {row.unread}
          </span>
        ) : null}
        {!row.joined ? (
          <span className="text-[10px] uppercase tracking-wide text-text-3">
            Join
          </span>
        ) : null}
      </Link>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="px-2 py-1.5 text-small text-text-3">{children}</li>;
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
