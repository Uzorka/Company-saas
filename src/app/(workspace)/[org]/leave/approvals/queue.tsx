"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/avatar";
import { Timeline } from "@/components/ui/timeline";
import {
  buildLeaveTimeline,
  leaveStatusShort,
  leaveStatusTone,
  waitedFor,
} from "@/lib/leave/model";
import { decideLeave } from "@/lib/leave/actions";
import { formatDate } from "@/lib/employees/display";
import type { LeaveRequestRow } from "@/lib/leave/queries";

export function ApprovalQueue({
  rows,
  isHr,
}: {
  rows: LeaveRequestRow[];
  isHr: boolean;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id}>
          <RequestCard row={row} isHr={isHr} />
        </li>
      ))}
    </ul>
  );
}

function RequestCard({ row, isHr }: { row: LeaveRequestRow; isHr: boolean }) {
  const router = useRouter();
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const name = row.employee
    ? `${row.employee.first_name} ${row.employee.last_name}`
    : "Unknown";

  // Whose turn is it? A request at the HOD stage is not yours to decide as
  // HR, and the button being present would only produce a refusal.
  const mine = isHr ? row.status === "pending_hr" : row.status === "pending_hod";
  const waited = waitedFor(row.submitted_at);

  function decide(approve: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await decideLeave({
        requestId: row.id,
        approve,
        note: approve ? note || undefined : note,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar name={name} size="lg" />
            <div className="min-w-0">
              <p className="text-h3">{name}</p>
              <p className="mt-0.5 font-mono text-small text-text-2">
                {row.leave_type?.name} · {formatDate(row.starts_on)} →{" "}
                {formatDate(row.ends_on)} · {Number(row.days_requested)} days
              </p>
              {waited ? (
                <p className="mt-0.5 font-mono text-[11px] text-warn-fg">
                  {waited}
                </p>
              ) : null}
            </div>
          </div>
          <StatusPill tone={leaveStatusTone[row.status]}>
            {leaveStatusShort[row.status]}
          </StatusPill>
        </div>

        {row.reason ? (
          <section>
            <h3 className="text-overline uppercase text-text-3">Reason given</h3>
            <p className="mt-1 text-body text-text-2">{row.reason}</p>
          </section>
        ) : null}

        <Timeline
          nodes={buildLeaveTimeline({
            status: row.status,
            approvals: row.approvals ?? [],
            routedToHod:
              (row.approvals ?? []).some((a) => a.stage === "hod") ||
              row.status === "pending_hod",
            submittedAt: row.submitted_at,
          })}
        />

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
          >
            {error}
          </p>
        ) : null}

        {!mine ? (
          <p className="border-t border-border pt-4 text-small text-text-3">
            {row.status === "pending_hod"
              ? "Waiting on the head of department — it reaches HR once they approve."
              : "Waiting on HR."}
          </p>
        ) : declining ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <Field
              label="Why are you declining?"
              htmlFor={`note-${row.id}`}
              required
              hint="The employee reads this, and may want to re-plan around it."
            >
              <Textarea
                id={`note-${row.id}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Stock-take week — could you move this to the following month?"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                loading={pending}
                onClick={() => decide(false)}
              >
                Decline
              </Button>
              <Button variant="ghost" onClick={() => setDeclining(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <Field
              label="Note"
              htmlFor={`approve-note-${row.id}`}
              optional
              hint="Shown on the approval timeline."
            >
              <Textarea
                id={`approve-note-${row.id}`}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Cover arranged with Adaeze."
                className="min-h-[60px]"
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button loading={pending} onClick={() => decide(true)}>
                <Check aria-hidden />
                {isHr ? "Approve" : "Approve and send to HR"}
              </Button>
              <Button variant="secondary" onClick={() => setDeclining(true)}>
                <X aria-hidden />
                Decline
              </Button>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
