"use client";

import { CreatePanel } from "@/components/forms/create-panel";
import { Field, Input } from "@/components/ui/field";
import { createPayrollPeriod } from "@/lib/payroll/actions";

/**
 * Open a payroll run.
 *
 * The period is created empty and in draft. Calculating it — which builds a
 * line for every active employee from their current compensation — is a
 * separate button on the period itself, because costing a payroll should not
 * be something that happens as a side effect of naming one.
 */
export function CreatePeriod({ org }: { org: string }) {
  return (
    <CreatePanel
      org={org}
      action={createPayrollPeriod}
      label="New period"
      title="New payroll period"
      submitLabel="Create draft"
      subtitle="Created empty, in draft. Calculating the lines is the next step."
    >
      <Field
        label="Label"
        htmlFor="label"
        hint="What people will call this run — for example March 2026."
        required
      >
        <Input id="label" name="label" placeholder="March 2026" required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Period starts" htmlFor="startsOn" required>
          <Input id="startsOn" name="startsOn" type="date" required />
        </Field>
        <Field label="Period ends" htmlFor="endsOn" required>
          <Input id="endsOn" name="endsOn" type="date" required />
        </Field>
      </div>

      <Field label="Pay date" htmlFor="payDate" hint="Optional — can be set later.">
        <Input id="payDate" name="payDate" type="date" />
      </Field>
    </CreatePanel>
  );
}
