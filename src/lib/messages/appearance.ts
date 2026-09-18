/**
 * How a conversation looks, for one person.
 *
 * Six themes and two densities, stored per membership so each person chooses
 * their own — the database refuses anything not on these lists, so a theme
 * that is removed here can never arrive from an old row and render as nothing.
 *
 * Every combination was checked for contrast: the outgoing bubble carries
 * white text and needs 4.5:1 against its own background, and the incoming
 * bubble carries the normal ink colour. A chat you cannot read in sunlight on
 * a depot forecourt is not a customisation, it is a fault.
 */
export const THEMES = ["default", "heron", "slate", "forest", "plum", "sand"] as const;
export type Theme = (typeof THEMES)[number];

export const LAYOUTS = ["comfortable", "compact"] as const;
export type Layout = (typeof LAYOUTS)[number];

export type ThemeStyle = {
  label: string;
  /** Behind the whole conversation. */
  surface: string;
  /** Your own messages: a solid colour carrying white text. */
  mine: string;
  /** Everyone else: a light tint carrying normal ink. */
  theirs: string;
  /** A swatch for the picker. */
  swatch: string;
};

export const themeStyles: Record<Theme, ThemeStyle> = {
  default: {
    label: "Default",
    surface: "bg-canvas",
    mine: "bg-brand-600 text-white",
    theirs: "bg-bg text-text border border-border",
    swatch: "bg-brand-600",
  },
  heron: {
    label: "Heron blue",
    surface: "bg-brand-50",
    mine: "bg-brand-700 text-white",
    theirs: "bg-bg text-text border border-brand-100",
    swatch: "bg-brand-700",
  },
  slate: {
    label: "Slate",
    surface: "bg-surface",
    // text-2 is #4a5666 — 7.4:1 against white, and white on it is 7.4:1 too.
    mine: "bg-text-2 text-white",
    theirs: "bg-bg text-text border border-border",
    swatch: "bg-text-2",
  },
  forest: {
    label: "Forest",
    surface: "bg-success-surface",
    mine: "bg-success-fg text-white",
    theirs: "bg-bg text-text border border-success-border",
    swatch: "bg-success-fg",
  },
  plum: {
    label: "Plum",
    surface: "bg-error-surface",
    mine: "bg-danger-fg text-white",
    theirs: "bg-bg text-text border border-error-border",
    swatch: "bg-danger-fg",
  },
  sand: {
    label: "Sand",
    surface: "bg-warn-surface",
    // warn-fg is #8a5600 — 5.9:1 against white.
    mine: "bg-warn-fg text-white",
    theirs: "bg-bg text-text border border-warn-border",
    swatch: "bg-warn-fg",
  },
};

export const layoutStyles: Record<
  Layout,
  { label: string; gap: string; bubble: string; text: string }
> = {
  comfortable: {
    label: "Comfortable",
    gap: "gap-3",
    bubble: "px-3.5 py-2.5",
    text: "text-body",
  },
  compact: {
    label: "Compact",
    gap: "gap-1.5",
    bubble: "px-3 py-1.5",
    text: "text-small",
  },
};

export function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

export function isLayout(value: string): value is Layout {
  return (LAYOUTS as readonly string[]).includes(value);
}
