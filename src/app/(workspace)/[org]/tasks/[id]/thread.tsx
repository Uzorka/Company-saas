"use client";

import { useRef } from "react";
import { useActionState } from "react";
import { MessageSquare, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { addTaskComment } from "@/lib/tasks/actions";
import type { FormState } from "@/lib/forms/result";
import type { TaskComment, TaskActivityRow } from "@/lib/tasks/queries";

/**
 * The conversation on a task, and what happened to it.
 *
 * Comments and activity are interleaved by time rather than shown as two
 * lists: "returned, because the photo was of the wrong aisle" and the reply to
 * it belong next to each other, and separating them makes the reader
 * reconstruct the order themselves.
 *
 * Nothing here can be edited or deleted — that is the schema's decision (there
 * is no update or delete policy on either table), not a screen still to come.
 */
export function TaskThread({
  org,
  taskId,
  comments,
  activity,
  canComment,
}: {
  org: string;
  taskId: string;
  comments: TaskComment[];
  activity: TaskActivityRow[];
  canComment: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<FormState, FormData>(
    async (prev, formData) => {
      const result = await addTaskComment(prev, formData);
      if (result.done) formRef.current?.reset();
      return result;
    },
    {},
  );

  const entries = [
    ...comments.map((c) => ({ kind: "comment" as const, at: c.created_at, c })),
    ...activity.map((a) => ({ kind: "activity" as const, at: a.created_at, a })),
  ].sort((x, y) => x.at.localeCompare(y.at));

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-h3">Activity</h2>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-small text-text-2">
          Nothing has happened on this task yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-4">
          {entries.map((entry) =>
            entry.kind === "comment" ? (
              <li key={entry.c.id} className="flex gap-3">
                <Avatar name={entry.c.authorName} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="text-small">
                    <span className="font-medium">{entry.c.authorName}</span>
                    <span className="ml-2 text-text-3">
                      {formatWhen(entry.c.created_at)}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-body text-text-2">
                    {entry.c.body}
                  </p>
                </div>
              </li>
            ) : (
              <li key={entry.a.id} className="flex gap-3">
                <span className="mt-1 grid size-8 shrink-0 place-items-center rounded-pill bg-canvas text-text-3">
                  <MessageSquare className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-small text-text-2">
                    {describeActivity(entry.a)}
                    <span className="ml-2 text-text-3">
                      {formatWhen(entry.a.created_at)}
                    </span>
                  </p>
                </div>
              </li>
            ),
          )}
        </ol>
      )}

      {canComment ? (
        <form ref={formRef} action={action} className="flex flex-col gap-3">
          <input type="hidden" name="org" value={org} />
          <input type="hidden" name="taskId" value={taskId} />

          <Field label="Add a comment" htmlFor="body">
            <Textarea
              id="body"
              name="body"
              rows={3}
              required
              placeholder="What happened, or what is needed next."
            />
          </Field>

          {state.error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {state.error}
            </p>
          ) : null}

          <Button type="submit" loading={pending} className="self-start">
            Comment
          </Button>
        </form>
      ) : (
        <p className="border-t border-border pt-4 text-small text-text-3">
          Your role can read this task but not comment on it.
        </p>
      )}
    </div>
  );
}

/**
 * Activity rows are written by the field-visit functions, which record what
 * they decided and why. Anything this does not recognise is shown as its raw
 * action rather than hidden — a row nobody can read is still evidence that
 * something happened.
 */
function describeActivity(row: TaskActivityRow): string {
  const who = row.actorName ?? "Someone";
  const reason = typeof row.detail.reason === "string" ? row.detail.reason : null;

  switch (row.action) {
    case "visit.submitted":
      return `${who} submitted a field visit.`;
    case "visit.verified":
      return `${who} verified the field visit.`;
    case "visit.returned":
      return reason
        ? `${who} returned the field visit — ${reason}`
        : `${who} returned the field visit.`;
    default:
      return `${who}: ${row.action}`;
  }
}

function formatWhen(value: string): string {
  return new Date(value).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
