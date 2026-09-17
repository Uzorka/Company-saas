/**
 * Motion tokens. Source: Developer Handoff section 10.
 *
 * Five durations, three easings. Motion answers one of three questions: where
 * did this come from, did my action land, or what changed? Nothing decorative
 * ships. `confirm` is reserved for check-in, field verification and payroll
 * publish — nothing else may use it.
 */
export const duration = {
  instant: 0.08,
  fast: 0.14,
  base: 0.2,
  slow: 0.32,
  confirm: 0.42,
} as const;

export const ease = {
  standard: [0.2, 0.8, 0.2, 1],
  enter: [0, 0.6, 0.25, 1],
  exit: [0.4, 0, 1, 1],
} as const;

/**
 * Route change within the app shell: a short rise with a fade.
 *
 * Kept small and fast on purpose. A page transition is the one piece of motion
 * a person sits through on every single navigation, so it has to be under the
 * threshold where it registers as waiting.
 */
export const pageTransition = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { type: "spring", duration: 0.28, bounce: 0 },
} as const;

/**
 * Slide-over. The handoff specified 320ms on transform; it is a spring now.
 *
 * This is the surface most often opened and closed in quick succession — pick
 * a row, close, pick the next — and a fixed curve restarts from wherever the
 * panel happens to be, losing its speed. The spring keeps it, so a fast close
 * after a fast open stays fast instead of stuttering.
 */
export const slideOver = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
  transition: { type: "spring", duration: 0.34, bounce: 0.06 },
} as const;

/** Dialog: scale from .97 with a fade. */
export const dialog = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: duration.base, ease: ease.enter },
} as const;

/** Bottom sheet: translateY, phone only. Spring, for the same reason. */
export const bottomSheet = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { type: "spring", duration: 0.34, bounce: 0.06 },
} as const;

/** Toast: 10px rise, auto-dismiss 5s (8s under reduced motion). */
export const toast = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 10 },
  transition: { duration: duration.base, ease: ease.enter },
} as const;

export const TOAST_DISMISS_MS = 5000;
export const TOAST_DISMISS_REDUCED_MS = 8000;

// ---------------------------------------------------------------------------
// Springs
//
// The tokens above are durations and cubic-béziers, which is what the handoff
// specified and what CSS transitions can express. They are still what every
// colour and shadow transition uses.
//
// Interactive motion is different. A panel you can grab, a button you press, a
// row that lifts — these read as physical, and a fixed duration cannot be
// interrupted without a jump: the element is mid-curve, and a new animation
// restarts from wherever it happens to be with no memory of how fast it was
// travelling. A spring carries its velocity across the interruption, which is
// the whole reason iOS feels the way it does.
//
// These mirror SwiftUI's own presets. Motion expresses a spring as `duration`
// (perceptual, not literal — the spring settles after it) and `bounce`, which
// maps to SwiftUI's damping fraction as bounce = 1 - dampingFraction.
// ---------------------------------------------------------------------------

/** SwiftUI `.smooth` — no overshoot at all. For anything carrying text. */
export const smooth = {
  type: "spring",
  duration: 0.3,
  bounce: 0,
} as const;

/** SwiftUI `.snappy` — a trace of overshoot. The default for controls. */
export const snappy = {
  type: "spring",
  duration: 0.3,
  bounce: 0.15,
} as const;

/** SwiftUI `.bouncy` — visible overshoot. Confirmations only. */
export const bouncy = {
  type: "spring",
  duration: 0.4,
  bounce: 0.3,
} as const;

/** Slower and softer, for large surfaces where snap would read as a jolt. */
export const gentle = {
  type: "spring",
  duration: 0.5,
  bounce: 0.1,
} as const;

/**
 * A list that arrives in sequence rather than all at once.
 *
 * The stagger is deliberately short. Long stagger looks like a loading
 * animation and makes a fast page feel slow; this is just enough to read as
 * arriving rather than appearing.
 *
 * Capped, because a stagger applied to fifty rows means the last one waits two
 * seconds — the effect has to be independent of how much data came back.
 */
export const STAGGER_SECONDS = 0.03;
export const STAGGER_MAX_INDEX = 12;

export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_MAX_INDEX) * STAGGER_SECONDS;
}

/** What a list item does on arrival. Paired with `staggerDelay`. */
export const listItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
} as const;

/**
 * Press feedback.
 *
 * Small enough to feel rather than watch — 2% on a 38px control is under a
 * pixel of travel, which is the point. It says the tap landed before the
 * network has any opinion.
 */
export const press = { scale: 0.98 } as const;
