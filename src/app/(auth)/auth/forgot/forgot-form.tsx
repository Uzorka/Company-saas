"use client";

import { useActionState } from "react";
import { AlertCircle, MailCheck } from "lucide-react";
import { requestReset, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function ForgotForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    requestReset,
    {},
  );

  // Confirmed the same way whether or not the address exists. Telling the
  // sender which emails are real would turn this form into a staff directory.
  if (state.sent) {
    return (
      <div
        role="status"
        className="mt-6 flex items-start gap-2.5 rounded-lg border border-success-border bg-success-surface p-4 text-small"
      >
        <MailCheck className="mt-0.5 size-4 shrink-0 text-success-fg" aria-hidden />
        <div>
          <p className="font-medium text-success-fg">Check your inbox</p>
          <p className="mt-1 text-text-2">
            If that email belongs to an active account, a reset link is on its
            way. It expires in one hour.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </div>
      ) : null}

      <Field label="Work email" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          autoCapitalize="none"
          required
        />
      </Field>

      <Button type="submit" size="lg" loading={pending} className="w-full">
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
