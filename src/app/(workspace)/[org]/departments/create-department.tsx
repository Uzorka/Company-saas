"use client";

import { CreatePanel } from "@/components/forms/create-panel";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createDepartment, createPosition } from "@/lib/employees/actions";

export type Option = { id: string; label: string };

export function CreateDepartment({
  org,
  departments,
}: {
  org: string;
  departments: Option[];
}) {
  return (
    <CreatePanel
      org={org}
      action={createDepartment}
      label="New department"
      title="New department"
      subtitle="Departments are deactivated rather than deleted — attendance, tasks and payroll all reference them historically."
    >
      <Field label="Name" htmlFor="name" required>
        <Input id="name" name="name" placeholder="Sales" required />
      </Field>

      <Field
        label="Code"
        htmlFor="code"
        hint="2–16 capital letters, digits or dashes. Used in reports and exports."
        required
      >
        <Input id="code" name="code" placeholder="SALES" required />
      </Field>

      <Field label="Parent department" htmlFor="parentId">
        <Select id="parentId" name="parentId" defaultValue="">
          <option value="">None — top level</option>
          {departments.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" rows={3} />
      </Field>
    </CreatePanel>
  );
}

export function CreatePosition({
  org,
  departments,
}: {
  org: string;
  departments: Option[];
}) {
  return (
    <CreatePanel
      org={org}
      action={createPosition}
      label="New position"
      title="New position"
      subtitle="A job title employees can be assigned to."
    >
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" placeholder="Field Sales Representative" required />
      </Field>

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

      <Field label="Grade" htmlFor="grade" hint="Optional.">
        <Input id="grade" name="grade" placeholder="Officer II" />
      </Field>
    </CreatePanel>
  );
}
