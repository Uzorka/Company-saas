/**
 * Public website content.
 *
 * ONE file. The brief is explicit: "Do not hard-code company content across
 * many components." Every public page reads from here, so replacing the
 * values below is a single edit rather than a hunt through components.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT THIS DEPLOYMENT IS
 *
 * CHF Heron Nigeria is a real business. This deployment is NOT their website
 * and was not commissioned by them — it is a demonstration of this product,
 * built with CHF Heron as the worked example so the pitch shows a real
 * distribution business rather than "Acme Corp".
 *
 * That distinction is load-bearing, because the deployment is on a public
 * URL that anyone can reach. So:
 *
 *   1. `demo.isDemo` puts a visible notice on every public page. Publishing
 *      a real company's name and details on a public URL with no notice
 *      produces something indistinguishable from their official site.
 *      Set it to false only for a deployment the company has actually asked
 *      for, on a domain they control.
 *
 *   2. Only facts the business itself publishes go in here, and only ones
 *      about the *business*. Nothing invented, and nothing about named
 *      individuals — see `leadership` below.
 *
 * The design pack shipped a complete-looking company: six named executives
 * with biographies, a founding year, coverage figures, client logos. All of
 * it was sample content invented to make the mockups feel real, and none of
 * it is here. See docs/DECISIONS.md D51 and D56.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * SOURCING
 *
 * chfheron.com is unreachable from the build environment, so these facts come
 * from a structured extract of the site supplied by the client on 2026-09-14.
 * docs/reference/chfheron-brand.md records what it verified, what it corrected,
 * and what it deliberately leaves out.
 *
 * That extract replaced an earlier set of guesses taken from business
 * directories. One was wrong: a second office in Apapa that the company does
 * not publish. It is gone. Directory data is a starting point, not a source.
 */

export type Leader = { name: string; role: string; bio?: string };
export type Service = { title: string; summary: string };
export type Office = { name: string; address: string };

export const company = {
  /** Shown in the header, footer and page titles. */
  name: "CHF Heron Nigeria",

  /** The full form, for the footer and anywhere the legal entity is named. */
  legalName: "CHF Heron Nigeria Ltd",

  /** From the company's own About page. Stable, unlike an anniversary count. */
  foundedYear: 1989,

  /** The workspace code employees type at sign-in. Matches the seeded tenant. */
  workspaceCode: "chfheron",

  /**
   * The demonstration notice. See the header comment — this is what keeps a
   * public deployment from reading as the company's official website.
   */
  demo: {
    isDemo: true,
    /** Short form, for the banner. */
    label: "Demonstration",
    /** Long form. Says who built it and who did not. */
    notice:
      "This is a product demonstration, not an official CHF Heron Nigeria website. It is not operated by or affiliated with CHF Heron Nigeria, and enquiries sent here do not reach them.",
  },

  /**
   * One sentence on what the business does. General on purpose — anything
   * sharper about scale or brand relationships is the client's claim to make
   * in their own words, not ours to assert for them.
   */
  tagline: "Quality household, beauty and food brands, across Nigeria.",

  /** The company's own homepage headline. Theirs, not ours. */
  heroHeading: "Bringing quality to every Nigerian home",
  heroBody:
    "Distributing international household, beauty, personal-care and food brands in Nigeria since 1989 — and selling them direct through our online store.",

  /**
   * Grounded in the company's own site. The earlier version described a generic
   * FMCG distributor and was invented.
   *
   * Note what is *not* claimed: not "exclusive" distribution, which the source
   * extract explicitly could not verify, and no product count, because the
   * company's own pages disagree with each other about it (1,000+ on the
   * homepage, 606 in the shop). See docs/reference/chfheron-brand.md.
   */
  services: [
    {
      title: "Brand distribution",
      summary:
        "Bringing international household, beauty, personal-care and food brands to the Nigerian market — among them Badia, Brabantia, Sebamed, Vileda and Kikkoman.",
    },
    {
      title: "Nationwide reach",
      summary:
        "We deliver to all 36 states, with pickup available in Lagos where an order qualifies.",
    },
    {
      title: "Online store",
      summary:
        "Our full range is available to order directly, across kitchen and dining, food and grocery, beauty and personal care, cleaning and laundry.",
    },
    {
      title: "Established since 1989",
      summary:
        "Built on transparent dealings, dependable supply and a product range that has grown with what customers ask for.",
    },
  ] as Service[],

  /**
   * Empty on purpose, and it should stay empty until CHF Heron says otherwise.
   *
   * Real names and job titles for their executives are findable online, but
   * putting them on an unaffiliated public demo publishes identifiable people
   * on a site they have never agreed to appear on. An invented name is a lie;
   * a real one taken without asking is worse. The page renders without this
   * section, and a leadership grid is not what the pitch turns on.
   */
  leadership: [] as Leader[],

  /**
   * One office, from the company's own contact page.
   *
   * An Apapa address used to sit above this, taken from a business directory.
   * The company does not publish it, so it is gone — a plausible address on a
   * contact page is something people act on.
   */
  offices: [
    {
      name: "Head office",
      address: "Plot 1C Akin Ogunlewe Street, Victoria Island, Lagos",
    },
  ] as Office[],

  /**
   * Left blank deliberately. A demonstration site must not route enquiries to
   * the real company's switchboard or inbox: they did not ask for the traffic,
   * and a stale directory number would send callers somewhere else entirely.
   * Fill these in only for a deployment CHF Heron has commissioned.
   */
  contact: {
    email: "",
    phone: "",
    /** The real site, so anyone who lands here is pointed at it. */
    website: "https://chfheron.com/",
    enquiryNote:
      "This is a demonstration, so no enquiry form here reaches CHF Heron Nigeria. Their own website is the way to contact them.",
  },

  /** Careers page intro. About this site, not a claim about the business. */
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
