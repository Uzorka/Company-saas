/**
 * Public website content.
 *
 * ONE file. The brief is explicit: "Do not hard-code company content across
 * many components." Every public page reads from here, so replacing the
 * placeholders below is a single edit rather than a hunt through components.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS IS MOSTLY PLACEHOLDERS
 *
 * The design pack contains a complete-looking company: named executives with
 * biographies, a founding year, coverage figures, client logos. All of it is
 * sample content invented to make the mockups feel real.
 *
 * Publishing invented executives and invented history on a live corporate
 * website would be stating things about a real business — and about named
 * people — that nobody has verified. So the *structure* is built from the
 * design, and the *claims* are left as placeholders that render honestly
 * until someone supplies the real ones.
 *
 * A section with no content does not render at all. The site is smaller
 * until it is filled in, rather than confidently wrong.
 *
 * See docs/BACKLOG.md — "Blocking Phase 8".
 * ─────────────────────────────────────────────────────────────────────────
 */

export type Leader = { name: string; role: string; bio?: string };
export type Service = { title: string; summary: string };
export type Office = { name: string; address: string };

export const company = {
  /** Shown in the header, footer and page titles. */
  name: "CHF Heron Nigeria",

  /** The workspace code employees type at sign-in. Matches the seeded tenant. */
  workspaceCode: "chfheron",

  /**
   * One sentence on what the business does. Kept factual and general —
   * anything sharper is a claim the client should make in their own words.
   */
  tagline: "Distribution across Nigeria.",

  /**
   * The hero line. The design's version made specific claims about scale and
   * brand relationships; those are the client's to assert, not ours.
   */
  heroHeading: "Distribution, warehousing and trade marketing",
  heroBody:
    "We move goods from port to shelf. This site is being prepared — the sections below fill in as content is supplied.",

  /**
   * Everything from here down is empty on purpose.
   *
   * Fill an array and its section appears. Leave it empty and the section is
   * omitted entirely, which is why the site never shows "Lorem ipsum" or an
   * invented executive.
   */

  /** e.g. { title: "Warehousing", summary: "…" } */
  services: [] as Service[],

  /**
   * Real people only. An invented name on a leadership page is a claim about
   * a person who does not exist, attached to a real company.
   */
  leadership: [] as Leader[],

  /** Real addresses only — these appear on a contact page people may act on. */
  offices: [] as Office[],

  /** Optional. Omitted from the contact page when blank. */
  contact: {
    email: "",
    phone: "",
    enquiryNote:
      "Send us a message and we will route it to the right desk.",
  },

  /** Careers page intro. Safe to state — it is about this site, not the business. */
  careersIntro:
    "Open roles are listed below. Applying takes a few minutes and you do not need an account.",

  careersEmptyNote:
    "There are no open roles right now. Speculative applications are welcome — get in touch through the contact page and we will keep your details on file.",
} as const;

/** True when a section has content worth rendering. */
export const hasContent = {
  services: company.services.length > 0,
  leadership: company.leadership.length > 0,
  offices: company.offices.length > 0,
  contactDetails: Boolean(company.contact.email || company.contact.phone),
};
