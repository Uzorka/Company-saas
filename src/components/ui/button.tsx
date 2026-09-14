import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button. Source: Developer Handoff section 06.
 *
 * Rules that are not negotiable:
 *  - One primary per view. If two actions compete for primary, the design is
 *    wrong — raise it rather than shipping two.
 *  - Destructive is never the default focus.
 *  - An icon-only button needs an aria-label; `IconButton` enforces it.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap " +
    "transition-[background-color,border-color,color,box-shadow] duration-(--duration-instant) ease-(--ease-standard) " +
    "disabled:pointer-events-none disabled:bg-disabled-bg disabled:text-disabled-fg disabled:border-border " +
    "[&_svg]:shrink-0 [&_svg]:size-[18px]",
  {
    variants: {
      variant: {
        primary:
          "bg-brand-600 text-white border border-brand-600 hover:bg-brand-700 hover:border-brand-700 active:bg-brand-800",
        secondary:
          "bg-bg text-text border border-border-hi hover:bg-surface active:bg-canvas",
        ghost:
          "bg-transparent text-text-2 border border-transparent hover:bg-canvas hover:text-text",
        destructive:
          "bg-danger-fg text-white border border-danger-fg hover:brightness-110 active:brightness-95",
        // The tenant's accent. accent-ink, not accent: their exact orange is
        // 2.96:1 behind white text, below even the large-text floor. Same hue,
        // dark enough to read. See src/content/brand.ts.
        accent:
          "bg-accent-ink text-white border border-accent-ink hover:brightness-110 active:brightness-95",
      },
      size: {
        sm: "h-[30px] px-3 text-small",
        md: "h-[38px] px-4 text-body",
        lg: "h-[44px] px-5 text-body",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <span
          aria-hidden
          className="size-4 animate-spin rounded-pill border-2 border-current border-t-transparent"
        />
      ) : null}
      {children}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "children"> {
  /** Required — an icon-only button always needs an accessible name. */
  label: string;
  icon: React.ReactNode;
}

export function IconButton({
  label,
  icon,
  className,
  size = "md",
  variant = "ghost",
  ...props
}: IconButtonProps) {
  return (
    <Button
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      className={cn(
        "px-0",
        size === "sm" && "w-[30px]",
        size === "md" && "w-[38px]",
        size === "lg" && "w-[44px]",
        className,
      )}
      {...props}
    >
      {icon}
    </Button>
  );
}

export { buttonVariants };
