/**
 * Chart colours.
 *
 * Two slots, and they were validated rather than chosen by eye:
 *
 *   node scripts/validate_palette.js "#2a63a0,#b06a00" --mode light --surface "#ffffff"
 *
 *   Lightness band      PASS  both inside L 0.43–0.77
 *   Chroma floor        PASS
 *   CVD separation      PASS  ΔE 21.4 protan · 23.8 tritan
 *   Normal-vision floor PASS  ΔE 26.3
 *   Contrast vs surface PASS  both ≥ 3:1
 *
 * `office` is brand-500, already a token. The brand-600 the rest of the product
 * uses failed the lightness band as a chart fill — it is a UI colour, and a
 * mark sitting on white needs to be lighter than a button does.
 *
 * There is no dark variant because the product is light-mode only (D4). If that
 * changes, these are re-stepped against the dark surface and re-validated, not
 * flipped.
 */
export const chartColors = {
  /** Categorical slot 1 — assigned to a series, never reassigned by rank. */
  office: "#2a63a0",
  /** Categorical slot 2. */
  remote: "#b06a00",
  /** Single-series bars: magnitude, one hue. */
  single: "#2a63a0",
  /** Surface, for the 2px gap that separates touching marks. */
  surface: "#ffffff",
  /** Gridlines: one step off surface, hairline, solid. */
  grid: "#e3e8ef",
  /** Axis text — a text token, never a series colour. */
  axis: "#7a8798",
} as const;
