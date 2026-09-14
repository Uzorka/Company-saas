"use client";

import { CreatePanel } from "@/components/forms/create-panel";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createJob } from "@/lib/recruitment/actions";

export type Option = { id: string; label: string };

/**
 * Post a job.
 *
 * Publishing is the one action in the workspace that puts text on the public
 * internet — jobs_public_read makes a published row readable by anonymous
 * visitors on the careers site. So it is an explicit checkbox, off by default,
 * with the consequence spelled out next to it rather than implied by a status
 * dropdown.
 */
export function CreateJob({
  org,
  departments,
}: {
  org: string;
  departments: Option[];
}) {
  return (
    <CreatePanel
      org={org}
      action={createJob}
      label="New role"
      title="Post a role"
      submitLabel="Save role"
      subtitle="Saved as a draft unless you publish it below."
    >
      <Field
        label="Title"
        htmlFor="title"
        hint="Becomes the web address of the role on the careers site."
        required
      >
        <Input id="title" name="title" placeholder="Field Sales Representative" required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Department" htmlFor="departmentId">
          <Select id="departmentId" name="departmentId" defaultValue="">
            <option value="">Not set</option>
            {departments.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Employment type" htmlFor="employmentType" required>
          <Select id="employmentType" name="employmentType" defaultValue="full_time">
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
            <option value="contract">Contract</option>
            <option value="intern">Intern</option>
            <option value="nysc">NYSC</option>
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location" htmlFor="location">
          <Input id="location" name="location" placeholder="Apapa, Lagos" />
        </Field>
        <Field label="Closes on" htmlFor="closesOn" hint="Optional.">
          <Input id="closesOn" name="closesOn" type="date" />
        </Field>
      </div>

      <Field
        label="Summary"
        htmlFor="summary"
        hint="One or two lines. Shown on the careers list."
      >
        <Textarea id="summary" name="summary" rows={2} />
      </Field>

      <Field label="About the role" htmlFor="description">
        <Textarea id="description" name="description" rows={5} />
      </Field>

      <Field label="Responsibilities" htmlFor="responsibilities">
        <Textarea id="responsibilities" name="responsibilities" rows={4} />
      </Field>

      <Field label="Requirements" htmlFor="requirements">
        <Textarea id="requirements" name="requirements" rows={4} />
      </Field>

      <label className="flex items-start gap-2.5 rounded-lg border border-warn-border bg-warn-bg p-3">
        <input
          type="checkbox"
          name="publish"
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-brand-600)]"
        />
        <span className="text-small text-warn-fg">
          <span className="font-semibold">Publish to the careers site now.</span>{" "}
          Anyone on the internet will be able to read this role and apply to it.
          Leave it unticked to save a draft.
        </span>
      </label>
    </CreatePanel>
  );
}
