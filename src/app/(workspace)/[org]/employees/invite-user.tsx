"use client";

import { useState, useTransition } from "react";
import { AlertCircle, KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/ui/slide-over";
import { Field, Input, Select } from "@/components/ui/field";
import { inviteUser, type InviteState } from "@/lib/people/actions";

export type EmployeeOption = { id: string; label: string };

/**
 * Create a sign-in account.
 *
 * Not built on CreatePanel, because this one cannot close on success: it
 * returns a password that exists in exactly one place — this screen — and is
 * never stored, logged or recoverable. Closing the panel automatically would
 * throw it away.
 */
export function InviteUser({
  org,
  employees,
}: {
  org: string;
  employees: EmployeeOption[];
}) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<InviteState>({});
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setState({});
    startTransition(async () => {
      setState(await inviteUser({}, formData));
    });
  }

  function close() {
    setOpen(false);
    setState({});
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden />
        Create account
      </Button>

      <SlideOver
        open={open}
        onClose={close}
        title="Create a sign-in account"
        subtitle="An employee record and a login are separate things. This makes the login."
      >
        {state.credentials ? (
          <div className="flex flex-col gap-4">
            <div className="rounded-lg border border-success-border bg-success-surface p-4">
              <p className="text-h3 text-success-fg">Account created</p>
              <p className="mt-1 text-small text-text-2">
                Give these to {state.credentials.email} and ask them to change
                the password after signing in.
              </p>
            </div>

            {state.warning ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {state.warning}
              </p>
            ) : null}

            <div className="rounded-lg border border-warn-border bg-warn-bg p-4">
              <p className="flex items-start gap-2 text-small text-warn-fg">
                <KeyRound className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  <strong>This password is shown once.</strong> It is not stored
                  anywhere and cannot be shown again. If you lose it, the person
                  resets it from the sign-in screen.
                </span>
              </p>
            </div>

            <dl className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <div>
                <dt className="text-overline uppercase text-text-3">Email</dt>
                <dd className="mt-0.5 font-mono text-body break-all">
                  {state.credentials.email}
                </dd>
              </div>
              <div>
                <dt className="text-overline uppercase text-text-3">
                  Temporary password
                </dt>
                <dd className="mt-0.5 font-mono text-body break-all">
                  {state.credentials.password}
                </dd>
              </div>
            </dl>

            <div className="flex gap-2.5">
              <Button onClick={() => setState({})}>Create another</Button>
              <Button variant="ghost" onClick={close}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form action={submit} className="flex flex-col gap-4" noValidate>
            <input type="hidden" name="org" value={org} />

            {state.error ? (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                {state.error}
              </p>
            ) : null}

            <Field label="Full name" htmlFor="fullName" required>
              <Input id="fullName" name="fullName" required />
            </Field>

            <Field
              label="Email"
              htmlFor="email"
              hint="They sign in with this."
              required
            >
              <Input id="email" name="email" type="email" required />
            </Field>

            <Field
              label="Role"
              htmlFor="roleSlug"
              hint="Management, HR and Accounts need an approved grant with a second approver, so they cannot be set here."
              required
            >
              <Select id="roleSlug" name="roleSlug" defaultValue="employee">
                <option value="employee">Employee</option>
                <option value="hod">Head of Department</option>
              </Select>
            </Field>

            <Field
              label="Link to a staff record"
              htmlFor="employeeId"
              hint={
                employees.length > 0
                  ? "Without this, their own payslips, leave and tasks will be empty — the account has nobody behind it."
                  : "No unlinked staff records. Add an employee first if this person should have one."
              }
            >
              <Select id="employeeId" name="employeeId" defaultValue="">
                <option value="">Not linked</option>
                {employees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="mt-2 flex items-center gap-2.5">
              <Button type="submit" loading={pending}>
                Create account
              </Button>
              <Button type="button" variant="ghost" onClick={close} disabled={pending}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </SlideOver>
    </>
  );
}
