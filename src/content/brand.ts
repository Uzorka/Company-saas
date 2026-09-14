/**
 * Tenant brand.
 *
 * The product has its own design system — spacing, layout, component shapes,
 * motion — and none of that changes per tenant. What changes is the surface a
 * customer recognises as theirs: the palette accents, the typefaces and the
 * mark. Those live here, so a second tenant is a second file rather than a
 * search through components.
 *
 * Source: docs/reference/chfheron-brand.md, from the client's extract of
 * chfheron.com (2026-09-14).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE VALUE IS NOT THEIRS, AND THE REASON MATTERS
 *
 * Their accent orange is #E87722, and their site uses it for call-to-action
 * buttons with white 14px text. Measured, that is 2.96:1 — below the 4.5:1
 * minimum for body text and below even the 3:1 floor for large text and UI.
 *
 * So the exact orange is kept wherever it does not carry text: accent rules,
 * marks, focus treatment. Where white text sits on it, `accentInk` is used
 * instead — the same hue darkened to 4.69:1. Copying a contrast failure into
 * a product that gates on accessibility would be inheriting a bug on purpose.
 *
 * Their `--ink-3` (#718096) has the same problem at small sizes (4.02:1), so
 * it is not adopted; this product's own muted token is used for that role.
 * ─────────────────────────────────────────────────────────────────────────
 */
export const brand = {
  /** Exactly this product's brand-600 already — arrived at independently. */
  blue: "#1B4F8C",
  blueInk: "#0F2747",
  blueMid: "#2A6BB3",
  blueSoft: "#EBF2FA",

  /** Their exact accent. Never behind text — see the note above. */
  accent: "#E87722",
  /** The same accent, dark enough to carry white text (4.69:1). */
  accentInk: "#B8590F",
  accentSoft: "#FDF0E6",

  /**
   * The mark.
   *
   * `assetUrl` is where the real logo lives on their site. It is deliberately
   * NOT rendered from there: hotlinking a client's server is fragile and rude,
   * and this environment cannot fetch it to vendor a copy.
   *
   * Until the file is supplied, the header renders a typographic wordmark built
   * from the structure their own description gives — "CHF" lettered in the
   * brand blue with an orange accent, "HERON" smaller beside it. It is a
   * stand-in that reads as their identity without pretending to be artwork
   * nobody here has seen. Drop the real file into /public and point
   * `assetPath` at it; the wordmark steps aside.
   */
  logo: {
    assetUrl: "https://chfheron.com/wp-content/themes/chfheron/assets/chf-logo.webp",
    assetPath: null as string | null,
    wordmark: { lead: "CHF", trail: "HERON" },
  },
} as const;
