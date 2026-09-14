"use client";

import { CreatePanel } from "@/components/forms/create-panel";
import { Field, Input, Select } from "@/components/ui/field";
import { updateEmployee } from "@/lib/employees/actions";
import type { EmployeeDetail } from "@/lib/employees/queries";

type Option = { id: string; label: string };

/**
 * Edit a profile.
 *
 * Employee number, start date and employment status are not here. Each is
 * load-bearing somewhere else — payroll history, leave entitlement, and a
 * constraint requiring an exit date — and the reasons are set out on
 * `updateEmployee`, which is where they are enforced.
 *
 * Built on CreatePanel: this one *should* close on success, because everything
 * it wrote is on the page behind it.
 */
export function EditEmployee({
  org,
  employee,
  departments,
  positions,
}: {
  org: string;
  employee: EmployeeDetail;
  departments: Option[];
  positions: Option[];
}) {
  return (
    <CreatePanel
      org={org}
      action={updateEmployee}
      label="Edit"
      title={`Edit ${employee.first_name} ${employee.last_name}`}
      subtitle="Employee number and start date are fixed — they anchor payroll and leave history."
      submitLabel="Save changes"
    >
      <input type="hidden" name="id" value={employee.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" required>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={employee.first_name}
            required
          />
        </Field>
        <Field label="Last name" htmlFor="lastName" required>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={employee.last_name}
            required
          />
        </Field>
      </div>

      <Field label="Work email" htmlFor="workEmail">
        <Input
          id="workEmail"
          name="workEmail"
          type="email"
          defaultValue={employee.work_email ?? ""}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" defaultValue={employee.phone ?? ""} />
        </Field>
        <Field label="Location" htmlFor="location">
          <Input
            id="location"
            name="location"
            defaultValue={employee.location ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Department" htmlFor="departmentId">
          <Select
            id="departmentId"
            name="departmentId"
            defaultValue={employee.department?.id ?? ""}
          >
            <option value="">No department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Position" htmlFor="positionId">
          <Select
            id="positionId"
            name="positionId"
            defaultValue={employee.position?.id ?? ""}
          >
            <option value="">No position</option>
            {positions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field label="Employment type" htmlFor="employmentType" required>
        <Select
          id="employmentType"
          name="employmentType"
          defaultValue={employee.employment_type}
          required
        >
          <option value="full_time">Full time</option>
          <option value="part_time">Part time</option>
          <option value="contract">Contract</option>
          <option value="intern">Intern</option>
          <option value="nysc">NYSC</option>
        </Select>
      </Field>
    </CreatePanel>
  );
}
