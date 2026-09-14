"use client";

import { useEffect, useSyncExternalStore, useTransition } from "react";
import { useLinkStatus } from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Did my click land?"
 *
 * The route skeletons in loading.tsx only appear once the new route starts
 * rendering. Between the click and that moment there was nothing: the old
 * screen sat there unchanged, which reads as a dead button and gets clicked
 * again — the exact failure this is here to prevent.
 *
 * Two signals, because they answer different questions:
 *
 *   - A spinner on the item you clicked. Answers "did *this* land", and it is
 *     the one people look at, because their eyes are already there.
 *   - A bar across the top. Answers "is the app doing something", and it
 *     covers navigations that start somewhere without an obvious control.
 *
 * Both are driven by Next's useLinkStatus(), which is only valid inside a
 * <Link>. So each link renders a marker component, and the markers report into
 * the tiny store below that the top bar subscribes to.
 */

// ---------------------------------------------------------------------------
// A counter rather than a boolean: a prefetch and a click can overlap, and two
// overlapping navigations that both clear the flag would hide the bar while one
// is still running.
// ---------------------------------------------------------------------------
let pending = 0;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function start() {
  pending += 1;
  emit();
}

function stop() {
  pending = Math.max(0, pending - 1);
  emit();
}

function isPending() {
  return pending > 0;
}

/** Server snapshot: nothing is navigating during the initial render. */
function notPending() {
  return false;
}

/**
 * Place inside a <Link> to report its navigation state upward, and to show a
 * spinner on the link itself.
 *
 * `className` positions the spinner for the link it sits in — the sidebar
 * wants it where the lock glyph goes, a card wants it in the corner.
 */
export function LinkPending({ className }: { className?: string }) {
  const { pending: linkPending } = useLinkStatus();

  useEffect(() => {
    if (!linkPending) return;
    start();
    return stop;
  }, [linkPending]);

  if (!linkPending) return null;

  return (
    <Loader2
      className={cn("size-3.5 shrink-0 animate-spin motion-reduce:animate-none", className)}
      aria-label="Loading"
    />
  );
}

/**
 * For navigation that does not come from a <Link> — the command palette pushes
 * a route directly, so useLinkStatus() never sees it and the bar would stay
 * dark through the slowest kind of jump, the one with no control to watch.
 *
 * Returns a runner that reports into the same store for the length of the
 * transition.
 */
export function useProgrammaticNav(): [boolean, (go: () => void) => void] {
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isPending) return;
    start();
    return stop;
  }, [isPending]);

  return [isPending, (go) => startTransition(go)];
}

/**
 * The top bar. Rendered once, in the shell.
 *
 * Indeterminate on purpose: the server has not told us how far along it is, and
 * a bar that pretends to know creeps to 90% and stops, which is worse than one
 * that only says "working".
 */
export function NavProgress() {
  const navigating = useSyncExternalStore(subscribe, isPending, notPending);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5"
      role="presentation"
    >
      <div
        className={cn(
          "h-full w-full origin-left bg-brand-600 transition-opacity duration-(--duration-fast)",
          navigating ? "opacity-100 animate-nav-progress" : "opacity-0",
        )}
      />
    </div>
  );
}
