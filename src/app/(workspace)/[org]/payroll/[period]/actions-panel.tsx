"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Calculator } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { advancePayroll, recalculatePayroll } from "@/lib/payroll/actions";
import { nextTransition, type PayrollStatus } from "@/lib/payroll/model";

/**
 * Pipeline actions.
 *
 * One primary action per view, per the design. Publishing gets a confirmation
 * that restates the consequence in the same words used everywhere else — it
 * is the only irreversible step in the product outside the audit log.
 */
export function PipelineActions({
  periodId,
  status,
  employeeCount,
  netTotal,
  canProcess,
  canApprove,
  canPublish,
  submittedByMe,
}: {
  periodId: string;
  status: PayrollStatus;
  employeeCount: number;
  netTotal: string;
  canProcess: boolean;
  canApprove: boolean;
  canPublish: boolean;
  submittedByMe: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const step = nextTransition[status];

  const holds =
    step?.permission === "payroll.approve"
      ? canApprove
      : step?.permission === "payroll.publish"
        ? canPublish
        : canProcess;

  // Surfaced before the click rather than as a refusal after it.
  const blockedBySoD = step?.to === "approved" && submittedByMe;

  function run(to: "review" | "approved" | "published" | "closed") {
    setError(null);
    startTransition(async () => {
      const result = await advancePayroll({ periodId, to });
      if (!result.ok) setError(result.error);
      else {
        setConfirming(false);
        router.refresh();
      }
    });
  }

  function recalc() {
    setError(null);
    startTransition(async () => {
      const result = await recalculatePayroll(periodId);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <Card>
      <CardBody className="flex flex-col gap-3">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
          >
            {error}
          </p>
        ) : null}

        {blockedBySoD ? (
          <p className="flex items-start gap-2 rounded-lg border border-warn-border bg-warn-surface p-3 text-small text-text-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warn-fg" aria-hidden />
            You sent this run for review, so someone else has to approve it.
            That separation is the point of the two stages.
          </p>
        ) : null}

        {confirming && step?.irreversible ? (
          <div className="flex flex-col gap-3 rounded-lg border border-error-border bg-error-surface p-4">
            <h3 className="text-h3 text-danger-fg">
              Publish payslips for {employeeCount}{" "}
              {employeeCount === 1 ? "employee" : "people"}?
            </h3>
            <p className="text-small text-text-2">
              This makes <span className="font-mono">{netTotal}</span> of
              payslips visible to employees. <strong>It cannot be undone.</strong>{" "}
              After publishing, a correction becomes an adjustment on the next
              period — these figures will never change.
            </p>
            <div className="flex flex-wrap gap-2">
              {/* The safe action first, per the design's dialog rule. */}
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={pending}
                onClick={() => run("published")}
              >
                Publish — this cannot be undone
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {step && holds && !blockedBySoD ? (
              <Button
                loading={pending}
                onClick={() =>
                  step.irreversible ? setConfirming(true) : run(step.to as never)
                }
              >
                {step.label}
              </Button>
            ) : null}

            {(status === "draft" || status === "processing") && canProcess ? (
              <Button variant="secondary" loading={pending} onClick={recalc}>
                <Calculator aria-hidden />
                Recalculate
              </Button>
            ) : null}

            {step && !holds ? (
              <p className="text-small text-text-3">
                Waiting on someone with permission to {step.label.toLowerCase()}.
              </p>
            ) : null}

            {!step ? (
              <p className="text-small text-text-3">
                This period is closed. Nothing further can change.
              </p>
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
