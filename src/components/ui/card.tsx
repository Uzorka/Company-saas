import { cn } from "@/lib/utils";

/**
 * Card. Source: Developer Handoff section 06.
 * e1 resting, e2 on hover for interactive cards. Sensitivity tint applies to
 * the whole card, not just a badge — the level has to register peripherally.
 */
export function Card({
  className,
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-bg shadow-e1",
        interactive &&
          "transition-shadow duration-(--duration-fast) ease-(--ease-standard) hover:shadow-e2",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 sm:p-6 pb-0 sm:pb-0", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-h3", className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 sm:p-6", className)} {...props} />;
}
