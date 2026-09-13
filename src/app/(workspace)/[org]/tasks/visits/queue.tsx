"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, RotateCcw } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { GeofenceMap } from "@/components/attendance/geofence-map";
import {
  formatAccuracy,
  formatDistance,
  exceptionLabel,
  type ExceptionCode,
} from "@/lib/attendance/geofence";
import { visitStateLabel, visitStateTone } from "@/lib/tasks/model";
import { reviewVisit } from "@/lib/tasks/actions";
import type { ReviewVisitRow } from "@/lib/tasks/queries";

/**
 * Evidence viewer and review actions. Source: Phase 5, HOD REVIEW.
 *
 * Everything the reviewer needs to judge the visit is on the card before they
 * decide: how far from the target, how accurate the fix was, what was
 * reported, and anything the system flagged. Accepting is one click; returning
 * requires a reason, because the assignee has to know what to do differently.
 */
export function ReviewQueue({ rows }: { rows: ReviewVisitRow[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((row) => (
        <li key={row.id}>
          <VisitCard row={row} />
        </li>
      ))}
    </ul>
  );
}

function VisitCard({ row }: { row: ReviewVisitRow }) {
  const router = useRouter();
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const target = row.task?.target?.[0];
  const radius = target?.allowed_radius_m ?? 150;
  const employee = row.employee
    ? `${row.employee.first_name} ${row.employee.last_name}`
    : "Unknown";

  function decide(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await reviewVisit({
        visitId: row.id,
        accept,
        reason: accept ? undefined : reason,
      });
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-h3">{row.task?.title ?? "Task"}</p>
            <p className="mt-0.5 font-mono text-[11px] text-text-3">
              {row.task?.reference} · {employee}
              {row.submitted_at
                ? ` · ${new Date(row.submitted_at).toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}`
                : ""}
            </p>
          </div>
          <StatusPill tone={visitStateTone[row.state]}>
            {visitStateLabel[row.state]}
          </StatusPill>
        </div>

        <div className="flex flex-wrap gap-5">
          <GeofenceMap
            distanceM={row.distance_m}
            accuracyM={row.accuracy_m}
            radiusM={radius}
            classified={
              row.distance_m !== null && row.distance_m <= radius
                ? "office"
                : "uncertain"
            }
            className="max-w-[180px]"
          />

          <dl className="grid min-w-[200px] flex-1 grid-cols-2 gap-3 self-start">
            <Stat label="Target">{target?.name ?? "—"}</Stat>
            <Stat label="Allowed">{radius} m</Stat>
            <Stat label="Distance" mono>
              {formatDistance(row.distance_m)}
            </Stat>
            <Stat label="Accuracy" mono>
              {formatAccuracy(row.accuracy_m)}
            </Stat>
          </dl>
        </div>

        {row.exception_codes.length > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-warn-border bg-warn-surface p-3 text-small text-text-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn-fg" aria-hidden />
            <span>
              {row.exception_codes
                .map((code) => exceptionLabel[code as ExceptionCode] ?? code)
                .join(" · ")}
            </span>
          </p>
        ) : null}

        {row.report ? (
          <section>
            <h3 className="text-overline uppercase text-text-3">Report</h3>
            <p className="mt-1 text-body text-text-2">{row.report}</p>
          </section>
        ) : null}

        {/* Evidence photos land here once storage upload is wired into the
            capture flow — the row and its bucket path already exist. */}

        {error ? (
          <p role="alert" className="rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg">
            {error}
          </p>
        ) : null}

        {returning ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <Field
              label="What needs redoing?"
              htmlFor={`reason-${row.id}`}
              required
              hint="The assignee sees this, so be specific about what to change."
            >
              <Textarea
                id={`reason-${row.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="The photo only shows the top shelf — please re-shoot the full bay."
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                loading={pending}
                onClick={() => decide(false)}
              >
                Return for re-capture
              </Button>
              <Button variant="ghost" onClick={() => setReturning(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button loading={pending} onClick={() => decide(true)}>
              <Check aria-hidden />
              Accept
            </Button>
            <Button variant="secondary" onClick={() => setReturning(true)}>
              <RotateCcw aria-hidden />
              Return
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Stat({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-overline uppercase text-text-3">{label}</dt>
      <dd className={`mt-0.5 text-body text-text ${mono ? "font-mono" : ""}`}>
        {children}
      </dd>
    </div>
  );
}
