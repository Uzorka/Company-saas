import Link from "next/link";
import {
  Inbox,
  SearchX,
  TriangleAlert,
  Lock,
  type LucideIcon,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The four universal states. Source: Developer Handoff section 09.
 *
 * Every list and panel ships all four. Each names a cause and offers a
 * recovery action — never a dead end, never a stack trace, never a 404 for a
 * permission problem.
 */
function StateBlock({
  icon: Icon,
  tone = "neutral",
  heading,
  body,
  action,
  className,
}: {
  icon: LucideIcon;
  tone?: "neutral" | "danger";
  heading: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border bg-bg px-6 py-12 text-center",
        tone === "danger" ? "border-error-border" : "border-border",
        className,
      )}
    >
      <Icon
        className={cn(
          "size-[26px]",
          tone === "danger" ? "text-danger-fg" : "text-text-3",
        )}
        aria-hidden
      />
      <h3
        className={cn(
          "text-h3",
          tone === "danger" ? "text-danger-fg" : "text-text",
        )}
      >
        {heading}
      </h3>
      <p className="max-w-[46ch] text-body text-text-2">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}

/** Nothing exists yet. Names what is missing and offers a way in. */
export function EmptyState(props: {
  heading: string;
  body: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return <StateBlock icon={Inbox} {...props} />;
}

/**
 * Distinct from EmptyState: the filter is the reason, and clearing it is the
 * primary action. Conflating the two makes a working product look broken.
 */
export function FilteredEmptyState({
  body = "Try a different search, or widen the filters.",
  onClear,
  className,
}: {
  body?: string;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <StateBlock
      icon={SearchX}
      heading="No matches"
      body={body}
      className={className}
      action={
        onClear ? (
          <Button variant="secondary" onClick={onClear}>
            Clear filters
          </Button>
        ) : null
      }
    />
  );
}

/** Names the cause, reassures that data is safe, offers a retry. */
export function ErrorState({
  heading = "Something went wrong",
  body = "The request failed. Your data is safe.",
  onRetry,
  className,
}: {
  heading?: string;
  body?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <StateBlock
      icon={TriangleAlert}
      tone="danger"
      heading={heading}
      body={body}
      className={className}
      action={
        onRetry ? (
          <Button variant="secondary" onClick={onRetry}>
            Try again
          </Button>
        ) : null
      }
    />
  );
}

/**
 * Permission state. The nav item stays visible with a lock and lands here —
 * never a 404, never a silently removed nav item. Silently removing navigation
 * makes users think the product is broken.
 */
export function PermissionState({
  module,
  roles,
  className,
}: {
  module: string;
  roles: string[];
  className?: string;
}) {
  const list =
    roles.length > 1
      ? `${roles.slice(0, -1).join(", ")} and ${roles[roles.length - 1]}`
      : roles[0];

  return (
    <StateBlock
      icon={Lock}
      heading={`${module} is restricted`}
      body={`Only ${list} can open this. If you need access, ask your administrator to grant it.`}
      className={className}
      action={
        <Link
          href="#request-access"
          className={buttonVariants({ variant: "secondary" })}
        >
          Request access
        </Link>
      }
    />
  );
}
