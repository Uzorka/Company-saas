"use client";

import * as React from "react";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Field. Source: Developer Handoff section 09.
 *
 * Persistent label above the field, always — a placeholder is an example,
 * never a label. Required is marked with an asterisk; optional fields say so,
 * because leaving the user to guess which is which costs data quality.
 * Errors sit inline below the field, carry an icon and specific guidance, are
 * tied to the input with aria-describedby and announced via a live region.
 *
 * Validation timing is the caller's job, but the contract is: on blur, never
 * on keystroke, re-validated on submit. Never block typing.
 */
export function Field({
  label,
  htmlFor,
  required = false,
  optional = false,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  optional?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const errorId = `${htmlFor}-error`;
  const hintId = `${htmlFor}-hint`;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="text-small font-medium text-text flex items-center gap-1"
      >
        {label}
        {required ? (
          <span className="text-danger-fg" aria-hidden>
            *
          </span>
        ) : null}
        {optional && !required ? (
          <span className="text-text-3 font-normal">Optional</span>
        ) : null}
      </label>

      {children}

      {hint && !error ? (
        <p id={hintId} className="text-small text-text-2">
          {hint}
        </p>
      ) : null}

      {/* Live region so the error is announced, not just seen. */}
      <p
        id={errorId}
        role="alert"
        aria-live="polite"
        className={cn(
          "text-small text-danger-fg items-start gap-1.5",
          error ? "flex" : "hidden",
        )}
      >
        {error ? (
          <>
            <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden />
            {error}
          </>
        ) : null}
      </p>
    </div>
  );
}

const controlBase =
  "w-full rounded-md border bg-bg text-body text-text placeholder:text-text-3 " +
  "transition-[border-color,box-shadow] duration-(--duration-fast) ease-(--ease-standard) " +
  "focus:border-brand-600 focus:outline-none focus:ring-3 focus:ring-brand-600/16 " +
  "disabled:bg-disabled-bg disabled:text-disabled-fg disabled:cursor-not-allowed " +
  "read-only:bg-surface " +
  // 38px desktop, 44px mobile — touch targets never drop below 44px on a phone.
  "h-[44px] sm:h-[38px] px-3";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  /** React 19 passes ref as a plain prop; declared so callers can use it. */
  ref?: React.Ref<HTMLInputElement>;
}

export function Input({ className, invalid, id, ...props }: InputProps) {
  return (
    <input
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={cn(
        controlBase,
        invalid
          ? "border-danger-fg bg-error-surface"
          : "border-border-hi",
        className,
      )}
      {...props}
    />
  );
}

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: React.Ref<HTMLTextAreaElement>;
}

export function Textarea({ className, invalid, id, ...props }: TextareaProps) {
  return (
    <textarea
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={cn(
        controlBase,
        "h-auto min-h-[88px] py-2.5 resize-y",
        invalid ? "border-danger-fg bg-error-surface" : "border-border-hi",
        className,
      )}
      {...props}
    />
  );
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  ref?: React.Ref<HTMLSelectElement>;
}

export function Select({ className, invalid, id, children, ...props }: SelectProps) {
  return (
    <select
      id={id}
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={cn(
        controlBase,
        "appearance-none pr-9",
        invalid ? "border-danger-fg bg-error-surface" : "border-border-hi",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
