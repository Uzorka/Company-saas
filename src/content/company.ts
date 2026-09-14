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
 * chfheron.com is unreachable from the build environment (the egress proxy
 * blocks it, as it blocks supabase.com and vercel.app). The business facts
 * below come from the company's own public listings and search results, not
 * from the site itself, so every one of them is marked with how confident it
 * is. Anything marked CONFIRM must be checked against chfheron.com before
 * this is shown to the client. See docs/BACKLOG.md.
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
  tagline: "Consumer goods distribution in Nigeria.",

  heroHeading: "From port to shelf, across Nigeria",
  heroBody:
    "A full-service distributor of fast-moving consumer goods — sourcing, warehousing, logistics, sales and in-store execution handled end to end.",

  /**
   * CONFIRM. Drawn from the company's public description of itself as a
   * full-service FMCG distributor managing the whole value chain. The four
   * lines below are that description split into services; the wording is
   * ours. Check it against chfheron.com/services before the pitch.
   */
  services: [
    {
      title: "Distribution",
      summary:
        "Nationwide route-to-market for fast-moving consumer goods, from domestic and international suppliers to retail.",
    },
    {
      title: "Warehousing and logistics",
      summary:
        "Storage and onward movement of stock, coordinated from the Lagos operation.",
    },
    {
      title: "Sales and merchandising",
      summary:
        "Field teams covering the trade — orders, shelf presence and in-store execution.",
    },
    {
      title: "Brand representation",
      summary:
        "Acting as in-market partner for consumer brands entering or growing in Nigeria.",
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
   * CONFIRM. From public business directory listings, not from chfheron.com.
   * Directory data goes stale — verify both before this is shown to anyone.
   */
  offices: [
    {
      name: "Apapa, Lagos",
      address: "39 Warehouse Road, off Creek Road, Apapa, Lagos",
    },
    {
      name: "Victoria Island, Lagos",
      address: "1C Akin Ogunlewe Street, Victoria Island, Lagos",
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
    enquiryNote:
      "Contact details are not published on this demonstration site. To reach CHF Heron Nigeria, use the details on their own website.",
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
