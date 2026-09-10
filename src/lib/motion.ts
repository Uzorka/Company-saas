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

/** Route change within the app shell: 8px rise with a fade. */
export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.base, ease: ease.enter },
} as const;

/** Slide-over: 320ms on transform, scrim fades to 32%. */
export const slideOver = {
  initial: { x: "100%" },
  animate: { x: 0 },
  exit: { x: "100%" },
  transition: { duration: duration.slow, ease: ease.standard },
} as const;

/** Dialog: scale from .97 with a fade. */
export const dialog = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
  transition: { duration: duration.base, ease: ease.enter },
} as const;

/** Bottom sheet: translateY, phone only. */
export const bottomSheet = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: { duration: duration.slow, ease: ease.standard },
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
