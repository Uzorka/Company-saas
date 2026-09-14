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
 * The signal belongs where the content is about to appear, not on the control
 * that was clicked. Someone who clicks "Employees" is already looking at the
 * space the directory will fill; putting a spinner back on the sidebar item
 * asks them to look away from it to find out whether anything is happening.
 *
 * So: the content area is covered while a navigation runs, and a thin bar
 * across the top carries the same state for surfaces with no content area of
 * their own — the public site and the sign-in screens.
 *
 * Both are driven by Next's useLinkStatus(), which is only valid inside a
 * <Link>. So each link renders a marker component that reports into the tiny
 * store below. The marker draws nothing itself.
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
 * Place inside a <Link> to report its navigation state upward.
 *
 * Renders nothing. It exists only because useLinkStatus() has to be called
 * from inside the <Link> it describes — the visible result of what it reports
 * is ContentLoading, over the content area.
 */
export function LinkPending() {
  const { pending: linkPending } = useLinkStatus();

  useEffect(() => {
    if (!linkPending) return;
    start();
    return stop;
  }, [linkPending]);

  return null;
}

/**
 * Covers the content area while a navigation is in flight.
 *
 * An overlay rather than a replacement, so the page underneath keeps its
 * height and the layout does not collapse and snap back when the new screen
 * arrives.
 *
 * The fade is held back for 150ms by the keyframe itself rather than a timer.
 * Most navigations in this app finish faster than that, and an overlay that
 * flashes on every quick click is its own kind of noise — worse than none,
 * because it makes a fast app look like it is struggling.
 */
export function ContentLoading() {
  const navigating = useSyncExternalStore(subscribe, isPending, notPending);

  if (!navigating) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-20 grid place-items-center",
        "bg-canvas/75 backdrop-blur-[1px] animate-content-loading",
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Loading</span>
      <Loader2
        className="size-7 animate-spin text-brand-600 motion-reduce:animate-none"
        aria-hidden
      />
    </div>
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
