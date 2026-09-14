"use client";

import { CreatePanel } from "@/components/forms/create-panel";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { requestLeave } from "@/lib/leave/actions";

export type LeaveTypeOption = { id: string; label: string };

/**
 * Request leave.
 *
 * The balance check, the working-day count and the routing all happen in
 * submit_leave_request(). This form deliberately does not compute a day count
 * to show alongside the dates: it would be a second implementation of
 * working_days_between(), and the two would drift.
 */
export function RequestLeave({
  org,
  leaveTypes,
}: {
  org: string;
  leaveTypes: LeaveTypeOption[];
}) {
  return (
    <CreatePanel
      org={org}
      action={requestLeave}
      label="Request leave"
      title="Request leave"
      submitLabel="Submit request"
      subtitle="Weekends are excluded from the day count. Your balance is checked when you submit."
    >
      <Field label="Type" htmlFor="leaveTypeId" required>
        <Select id="leaveTypeId" name="leaveTypeId" defaultValue="" required>
          <option value="" disabled>
            Choose a type
          </option>
          {leaveTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First day" htmlFor="startsOn" required>
          <Input id="startsOn" name="startsOn" type="date" required />
        </Field>
        <Field label="Last day" htmlFor="endsOn" required>
          <Input id="endsOn" name="endsOn" type="date" required />
        </Field>
      </div>

      <Field
        label="Reason"
        htmlFor="reason"
        hint="Optional, but it helps whoever approves it plan cover."
      >
        <Textarea id="reason" name="reason" rows={3} />
      </Field>
    </CreatePanel>
  );
}
