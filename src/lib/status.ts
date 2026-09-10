/**
 * Status vocabulary. Source: Developer Handoff section 02.
 *
 * Colour is never the only cue: every status carries a tint, a glyph and a
 * word. The system must survive greyscale printing and colour-blind vision, so
 * never render a status as a bare coloured dot.
 */
export type StatusTone = "success" | "warn" | "danger" | "info" | "mute";

export const statusGlyph: Record<StatusTone, string> = {
  success: "●",
  warn: "▲",
  danger: "✕",
  info: "◇",
  mute: "—",
};

export const statusClass: Record<StatusTone, string> = {
  success: "bg-success-bg text-success-fg",
  warn: "bg-warn-bg text-warn-fg",
  danger: "bg-danger-bg text-danger-fg",
  info: "bg-info-bg text-info-fg",
  mute: "bg-canvas text-text-2",
};
