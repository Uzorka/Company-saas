"use client";

import { useState, useTransition } from "react";
import { AlertCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SlideOver } from "@/components/ui/slide-over";
import type { FormState } from "@/lib/forms/result";

/**
 * The "create a thing" pattern, once.
 *
 * A trigger button, a slide-over, a form inside it, and the three states every
 * one of these needs: pending, failed with a message, and done. The design
 * already chose a slide-over over a modal for this — the list stays visible
 * behind it, so you can see what you are adding to.
 *
 * Each caller supplies only its own fields. Nothing here knows what is being
 * created, which is why all six forms behave identically.
 */
export function CreatePanel({
  label,
  title,
  subtitle,
  org,
  action,
  submitLabel,
  children,
}: {
  /** Text on the trigger button, e.g. "Add employee". */
  label: string;
  /** Heading inside the panel. */
  title: string;
  subtitle?: string;
  /** Org slug, submitted with the form so the action can re-verify it. */
  org: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  submitLabel?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  // The action is called here rather than through useActionState because the
  // panel has to close on success. Reacting to a result in an effect means
  // setting state from an effect, which is the pattern that causes the
  // double-render bug the lint rule is named for; doing it in the submit
  // handler is the same outcome with none of that.
  function submit(formData: FormData) {
    startTransition(async () => {
      const result = await action({}, formData);
      if (result.done) {
        setError(undefined);
        setOpen(false);
        return;
      }
      setError(result.error ?? "That couldn't be saved. Try again.");
    });
  }

  function close() {
    setOpen(false);
    setError(undefined);
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        {label}
      </Button>

      <SlideOver open={open} onClose={close} title={title} subtitle={subtitle}>
        <form action={submit} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="org" value={org} />

          {error ? (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {error}
            </p>
          ) : null}

          {children}

          <div className="mt-2 flex items-center gap-2.5">
            <Button type="submit" loading={pending}>
              {submitLabel ?? label}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
          </div>
        </form>
      </SlideOver>
    </>
  );
}
