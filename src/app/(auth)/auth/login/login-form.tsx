"use client";

import { useActionState, useEffect, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { signIn, type AuthState } from "../actions";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

const COMPANY_CODE_KEY = "heron.companyCode";

/**
 * The design specifies: validation on blur, never on keystroke; errors fade in
 * over 140ms with no shake; and the company code is remembered after the first
 * successful sign-in.
 *
 * Per-field blur validation arrives with the shared form hook in Phase 3.
 * Until then the server action is the only validator — which is the layer that
 * has to be right anyway.
 *
 * The remembered code is a convenience only — it is stored in localStorage,
 * which is per-browser and carries no authority. Nothing about who the user is
 * or what they may do is ever read from the browser.
 */
export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    signIn,
    {},
  );
  const companyCodeRef = useRef<HTMLInputElement>(null);

  // Written straight to the DOM rather than into React state: localStorage is
  // an external system unavailable during server rendering, and prefilling a
  // field is exactly the kind of synchronisation an effect is for. Holding it
  // in state instead would cascade a re-render on every mount for no gain.
  useEffect(() => {
    try {
      const remembered = window.localStorage.getItem(COMPANY_CODE_KEY);
      if (remembered && companyCodeRef.current) {
        companyCodeRef.current.value = remembered;
      }
    } catch {
      // Private mode, or site data blocked. The field simply starts empty.
    }
  }, []);

  return (
    <form
      action={(formData) => {
        try {
          window.localStorage.setItem(
            COMPANY_CODE_KEY,
            String(formData.get("companyCode") ?? ""),
          );
        } catch {
          // Not being able to remember the code must never block signing in.
        }
        return formAction(formData);
      }}
      className="mt-6 flex flex-col gap-4"
      noValidate
    >
      {state.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-error-border bg-error-surface p-3 text-small text-danger-fg"
          style={{ animation: "none" }}
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {state.error}
        </div>
      ) : null}

      <input type="hidden" name="next" value={next ?? ""} />

      <Field label="Company code" htmlFor="companyCode" required>
        <Input
          id="companyCode"
          name="companyCode"
          ref={companyCodeRef}
          defaultValue=""
          placeholder="chfheron"
          autoComplete="organization"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>

      <Field label="Work email" htmlFor="email" required>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@company.com"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
        />
      </Field>

      <Field label="Password" htmlFor="password" required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Button type="submit" size="lg" loading={pending} className="mt-1 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
