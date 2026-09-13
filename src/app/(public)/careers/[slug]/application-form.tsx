"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { submitApplication, type ApplyState } from "./actions";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

export function ApplicationForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState<ApplyState, FormData>(
    submitApplication,
    {},
  );

  if (state.submitted) {
    return (
      <div
        role="status"
        className="mt-6 flex items-start gap-3 rounded-xl border border-success-border bg-success-surface p-5"
      >
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-fg" aria-hidden />
        <div>
          <p className="text-h3 text-success-fg">Application received</p>
          <p className="mt-1 max-w-[55ch] text-body text-text-2">
            Thank you. We read every application. If your experience fits the
            role, someone from the hiring team will be in touch.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
      <input type="hidden" name="jobId" value={jobId} />

      {state.error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" required>
          <Input id="firstName" name="firstName" autoComplete="given-name" required />
        </Field>
        <Field label="Last name" htmlFor="lastName" required>
          <Input id="lastName" name="lastName" autoComplete="family-name" required />
        </Field>
      </div>

      <Field label="Email" htmlFor="email" required>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Phone" htmlFor="phone" optional>
          <Input id="phone" name="phone" type="tel" autoComplete="tel" />
        </Field>
        <Field label="Where are you based?" htmlFor="location" optional>
          <Input id="location" name="location" autoComplete="address-level2" />
        </Field>
      </div>

      <Field
        label="CV"
        htmlFor="cv"
        optional
        hint="PDF or Word, up to 5 MB. Your CV is stored privately and seen only by the hiring team."
      >
        <input
          id="cv"
          name="cv"
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="w-full rounded-md border border-border-hi bg-bg p-2.5 text-small file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-small file:text-text"
        />
      </Field>

      <Field
        label="Anything you'd like us to know?"
        htmlFor="coverLetter"
        optional
      >
        <Textarea
          id="coverLetter"
          name="coverLetter"
          placeholder="A few lines about why this role interests you."
        />
      </Field>

      <Button type="submit" size="lg" loading={pending} className="self-start">
        {pending ? "Sending…" : "Send application"}
      </Button>

      <p className="text-small text-text-3">
        We use these details only to consider your application.
      </p>
    </form>
  );
}
