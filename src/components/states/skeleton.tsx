/**
 * Loading skeletons.
 *
 * The app had no loading state at all: every navigation is a server render, so
 * the browser sat on the previous screen with nothing moving until the new one
 * was ready. On a slow connection that is indistinguishable from a dead click.
 *
 * These render instantly from `loading.tsx` while the server works. They are
 * deliberately shaped like the screen that follows — a page header, then rows
 * or cards — so the layout does not jump when the real content lands.
 *
 * The pulse is a single animation on a container rather than per-element, so
 * the whole skeleton breathes together instead of shimmering out of step.
 */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-canvas ${className}`} aria-hidden />;
}

export function PageSkeleton({
  rows = 6,
  variant = "list",
}: {
  rows?: number;
  variant?: "list" | "cards" | "board";
}) {
  return (
    <div
      className="flex animate-pulse flex-col gap-5 motion-reduce:animate-none"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-[180px]" />
        <Skeleton className="h-4 w-[260px]" />
      </div>

      {variant === "cards" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] rounded-xl" />
          ))}
        </div>
      ) : variant === "board" ? (
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex min-w-[220px] flex-1 flex-col gap-2">
              <Skeleton className="h-5 w-[100px]" />
              <Skeleton className="h-[72px] rounded-xl" />
              <Skeleton className="h-[72px] rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-full rounded-lg" />
          {Array.from({ length: rows }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] rounded-lg" />
          ))}
        </div>
      )}
    </div>
  );
}
