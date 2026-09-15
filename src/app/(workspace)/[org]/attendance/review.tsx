"use client";

import { useState, useTransition } from "react";
import { AlertCircle, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/ui/slide-over";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { approveAttendance, correctAttendance } from "@/lib/attendance/review";
import type { FormState } from "@/lib/forms/result";

/**
 * Dealing with a flagged day.
 *
 * Two outcomes, and they are not the same button with a different label:
 * approving says the record is right as it stands, correcting says it is not
 * and records what should have been there instead. Both are permanent.
 *
 * Approve is a plain button because it needs no input. Correct opens a panel
 * because it needs a reason, and the reason is the point — a corrected
 * timesheet with no explanation is worth less than the flagged one.
 */
export function ReviewAttendance({
  org,
  recordId,
  recordedType,
}: {
  org: string;
  recordId: string;
  recordedType: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<FormState>({});
  const [pending, startTransition] = useTransition();

  function approve() {
    setState({});
    startTransition(async () => {
      const formData = new FormData();
      formData.set("org", org);
      formData.set("recordId", recordId);
      setState(await approveAttendance({}, formData));
    });
  }

  function correct(formData: FormData) {
    setState({});
    startTransition(async () => {
      const result = await correctAttendance({}, formData);
      setState(result);
      if (result.done) setOpen(false);
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={approve} disabled={pending}>
          {pending ? "Working…" : "Approve as recorded"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <PencilLine aria-hidden />
          Correct
        </Button>
      </div>

      {state.error && !open ? (
        <p role="alert" className="max-w-[40ch] text-small text-danger-fg">
          {state.error}
        </p>
      ) : null}

      <SlideOver
        open={open}
        onClose={() => {
          setOpen(false);
          setState({});
        }}
        title="Correct this record"
        subtitle="The original stays exactly as it was. This records what should have been there, and why."
      >
        <form action={correct} className="flex flex-col gap-4">
          <input type="hidden" name="org" value={org} />
          <input type="hidden" name="recordId" value={recordId} />

          <Field
            label="Why"
            htmlFor="reason"
            hint="Kept permanently and readable by anyone who can see the record. At least a sentence."
            required
          >
            <Textarea id="reason" name="reason" rows={3} required minLength={10} />
          </Field>

          <Field
            label="Corrected check-in"
            htmlFor="newCheckIn"
            hint="Leave blank to keep the recorded time."
          >
            <Input id="newCheckIn" name="newCheckIn" type="datetime-local" />
          </Field>

          <Field
            label="Corrected check-out"
            htmlFor="newCheckOut"
            hint="Leave blank to keep the recorded time."
          >
            <Input id="newCheckOut" name="newCheckOut" type="datetime-local" />
          </Field>

          <Field
            label="Corrected type"
            htmlFor="newType"
            hint={`Recorded as ${recordedType}. Leave as is to keep it.`}
          >
            <Select id="newType" name="newType" defaultValue="">
              <option value="">Keep as recorded</option>
              <option value="office">Office</option>
              <option value="remote">Remote</option>
              <option value="uncertain">Uncertain</option>
            </Select>
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

          <Button type="submit" loading={pending}>
            Record the correction
          </Button>
        </form>
      </SlideOver>
    </div>
  );
}
