"use client";

import { CreatePanel } from "@/components/forms/create-panel";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { createTask } from "@/lib/tasks/actions";

export type Option = { id: string; label: string };

/**
 * Create a task.
 *
 * Verification mode is the field that matters: it decides what the assignee
 * has to produce to close the task, and it cannot be changed by them. "Photo
 * and location" is what a field visit means in this product.
 *
 * Assignees are a multi-select rather than a picker because the list is one
 * department's worth of people, not the whole company.
 */
export function CreateTask({
  org,
  departments,
  employees,
}: {
  org: string;
  departments: Option[];
  employees: Option[];
}) {
  return (
    <CreatePanel
      org={org}
      action={createTask}
      label="New task"
      title="New task"
      subtitle="The reference is allocated automatically."
    >
      <Field label="Title" htmlFor="title" required>
        <Input id="title" name="title" placeholder="Stock count — Apapa depot" required />
      </Field>

      <Field label="Description" htmlFor="description">
        <Textarea id="description" name="description" rows={4} />
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
        <Field label="Priority" htmlFor="priority" required>
          <Select id="priority" name="priority" defaultValue="medium">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Proof required to close it"
        htmlFor="verificationMode"
        hint="The assignee cannot change this."
        required
      >
        <Select id="verificationMode" name="verificationMode" defaultValue="none">
          <option value="none">None — they mark it done</option>
          <option value="photo">A photo</option>
          <option value="location">A location reading</option>
          <option value="photo_location">Photo and location</option>
          <option value="photo_location_report">Photo, location and a written report</option>
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Start date" htmlFor="startDate">
          <Input id="startDate" name="startDate" type="date" />
        </Field>
        <Field label="Due date" htmlFor="dueDate">
          <Input id="dueDate" name="dueDate" type="date" />
        </Field>
      </div>

      <Field
        label="Assign to"
        htmlFor="assigneeIds"
        hint={
          employees.length > 0
            ? "Hold Ctrl (or Cmd) to pick more than one. You can leave it unassigned."
            : "No employees yet — add staff first, or create the task and assign it later."
        }
      >
        <Select
          id="assigneeIds"
          name="assigneeIds"
          multiple
          size={Math.min(6, Math.max(3, employees.length))}
          className="h-auto py-2"
          disabled={employees.length === 0}
        >
          {employees.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
    </CreatePanel>
  );
}
