"use client";

import { CreatePanel } from "@/components/forms/create-panel";
import { Field, Input, Select } from "@/components/ui/field";
import { createEmployee } from "@/lib/employees/actions";

export type Option = { id: string; label: string };

/**
 * Add an employee. Replaces the button that used to sit here doing nothing.
 *
 * No account is created — an employee record and a login are separate things
 * in this schema, and inviting the person is its own step. Employment status
 * offers only active and probation: the others (leave, suspended, exited) are
 * transitions from an existing record, not states you hire someone into.
 */
export function CreateEmployee({
  org,
  departments,
  positions,
}: {
  org: string;
  departments: Option[];
  positions: Option[];
}) {
  return (
    <CreatePanel
      org={org}
      action={createEmployee}
      label="Add employee"
      title="Add an employee"
      subtitle="Creates the staff record. Inviting them to sign in is a separate step."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" required>
          <Input id="firstName" name="firstName" required />
        </Field>
        <Field label="Last name" htmlFor="lastName" required>
          <Input id="lastName" name="lastName" required />
        </Field>
      </div>

      <Field
        label="Employee number"
        htmlFor="employeeNo"
        hint="Letters, a dash, then digits — for example CHF-001."
        required
      >
        <Input id="employeeNo" name="employeeNo" placeholder="CHF-001" required />
      </Field>

      <Field label="Work email" htmlFor="workEmail">
        <Input id="workEmail" name="workEmail" type="email" />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" />
        </Field>
        <Field label="Location" htmlFor="location">
          <Input id="location" name="location" placeholder="Apapa" />
        </Field>
      </div>

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
        <Field label="Position" htmlFor="positionId">
          <Select id="positionId" name="positionId" defaultValue="">
            <option value="">Not set</option>
            {positions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Employment type" htmlFor="employmentType" required>
          <Select id="employmentType" name="employmentType" defaultValue="full_time">
            <option value="full_time">Full time</option>
            <option value="part_time">Part time</option>
            <option value="contract">Contract</option>
            <option value="intern">Intern</option>
            <option value="nysc">NYSC</option>
          </Select>
        </Field>
        <Field label="Status" htmlFor="employmentStatus" required>
          <Select id="employmentStatus" name="employmentStatus" defaultValue="active">
            <option value="active">Active</option>
            <option value="probation">Probation</option>
          </Select>
        </Field>
      </div>

      <Field label="Hire date" htmlFor="hireDate" required>
        <Input id="hireDate" name="hireDate" type="date" required />
      </Field>
    </CreatePanel>
  );
}
