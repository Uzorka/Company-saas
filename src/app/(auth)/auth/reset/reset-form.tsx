"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

/** Mirrors the org's security policy: 10 characters, one number, one symbol. */
function passwordProblem(password: string): string | null {
  if (password.length < 10) return "Use at least 10 characters.";
  if (!/[0-9]/.test(password)) return "Include at least one number.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Include at least one symbol.";
  return null;
}

export function ResetForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [linkValid, setLinkValid] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    // The recovery link puts a session in place via the URL fragment. No
    // session means the link expired or was already used.
    supabase.auth
      .getSession()
      .then(({ data }) => setLinkValid(Boolean(data.session)))
      .catch(() => setLinkValid(false));
  }, []);

  if (linkValid === false) {
    return (
      <div className="mt-6 flex flex-col gap-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            This reset link has expired or has already been used. Links last one
            hour.
          </span>
        </div>
        <Link href="/auth/forgot">
          <Button variant="secondary" size="lg" className="w-full">
            Request a new link
          </Button>
        </Link>
      </div>
    );
  }

  async function onSubmit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError("Both passwords must match.");

    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);

    if (updateError) {
      setError("That didn't work. Request a new link and try again.");
      return;
    }

    router.push("/auth/workspace");
  }

  return (
    <form action={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
      {error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </div>
      ) : null}

      <Field label="New password" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Field label="Confirm new password" htmlFor="confirm" required>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </Field>

      <Button
        type="submit"
        size="lg"
        loading={pending}
        disabled={linkValid === null}
        className="w-full"
      >
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
