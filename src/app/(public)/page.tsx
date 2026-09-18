import Link from "next/link";
import {
  ArrowRight,
  ChefHat,
  Sparkles,
  ShoppingBasket,
  SprayCan,
  Truck,
  Store,
  Handshake,
} from "lucide-react";
import { company, hasContent } from "@/content/company";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Home. Source: Phase 2, rebuilt.
 *
 * WHAT CHANGED AND WHY
 *
 * The first version was a headline, two buttons and four cards on white, and
 * the right half of the hero was empty. Everything on it was true, which was
 * the point at the time — but a distributor trading since 1989 across ten
 * product categories reads as a startup with nothing to say.
 *
 * Nothing invented has been added to fix that. What is here is material the
 * company already publishes and this site was not yet using: its categories,
 * the brands it names, and its own stated values, in its own words. The page
 * got longer because there was more that was true, not because it needed
 * filling.
 *
 * WHAT IS STILL ABSENT, DELIBERATELY
 *
 * No photographs of a business we have never visited. No partner logos —
 * a mark belongs to its owner. No leadership, no testimonials, no product
 * count (their own pages disagree). No "exclusive distributor". The visual
 * weight comes from typography, the brand palette and layout, which is the
 * honest way to make a page feel substantial when you have facts and no
 * pictures. See docs/reference/chfheron-brand.md.
 */
export default async function HomePage() {
  let openRoles = 0;

  // The design's "live open-role count from /recruitment". Published jobs are
  // readable by anon, so this works without a session.
  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    const { count } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("status", "published");
    openRoles = count ?? 0;
  }

  const categoryIcons = [ChefHat, ShoppingBasket, Sparkles, SprayCan];
  const serviceIcons = [Truck, Store, ShoppingBasket, Handshake];

  return (
    <>
      {/* ---------------------------------------------------------------
          Hero.

          A deep brand field rather than white. The shapes behind it are
          drawn, not photographed: two soft radial washes and a fine grid,
          all aria-hidden, which gives the composition somewhere to breathe
          without asserting anything about the business.
          --------------------------------------------------------------- */}
      <section className="relative isolate overflow-hidden bg-brand-800 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            backgroundImage:
              "radial-gradient(60rem 30rem at 85% -10%, rgba(232,119,34,0.22), transparent 60%)," +
              "radial-gradient(45rem 28rem at 8% 110%, rgba(42,99,160,0.55), transparent 65%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px)," +
              "linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            maskImage: "radial-gradient(60% 60% at 70% 30%, #000, transparent)",
            WebkitMaskImage: "radial-gradient(60% 60% at 70% 30%, #000, transparent)",
          }}
        />

        <div className="mx-auto grid max-w-content-max gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <p className="flex items-center gap-2 text-overline uppercase text-accent">
              <span className="h-px w-8 bg-accent" aria-hidden />
              Nigeria · since {company.facts.foundedValue}
            </p>

            <h1 className="mt-4 max-w-[18ch] text-display">
              {company.heroHeading}
            </h1>

            <p className="mt-5 max-w-[56ch] text-body text-brand-100">
              {company.heroBody}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/careers"
                className={buttonVariants({ variant: "accent", size: "lg" })}
              >
                {openRoles > 0
                  ? `See ${openRoles} open ${openRoles === 1 ? "role" : "roles"}`
                  : "Careers"}
                <ArrowRight aria-hidden />
              </Link>
              <Link
                href="/about"
                className="inline-flex h-[44px] items-center gap-2 rounded-md border border-white/30 px-5 text-body font-medium text-white transition-colors duration-(--duration-instant) hover:bg-white/10"
              >
                About the company
              </Link>
            </div>
          </div>

          {/* The figures, as a card rather than a row: it gives the empty
              half of the hero something to be, and puts the company's own
              claim next to an attribution instead of on its own. */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-white/15 bg-white/10 sm:grid-cols-3 lg:grid-cols-1">
            <Figure
              label={company.facts.foundedLabel}
              value={company.facts.foundedValue}
            />
            <Figure
              label={company.facts.statesLabel}
              value={company.facts.statesValue}
              note={company.facts.statesNote}
            />
            <Figure
              label={company.facts.brandsLabel}
              value={company.facts.brandsValue}
            />
          </dl>
        </div>
      </section>

      {/* ---------------------------------------------------------------
          Categories — what they actually sell.
          --------------------------------------------------------------- */}
      {hasContent.categories ? (
        <section className="border-b border-border bg-bg">
          <div className="mx-auto max-w-content-max px-4 py-16 sm:px-6">
            <Heading
              eyebrow="What we carry"
              title="Four of the ten categories we stock"
              body="Household, beauty, personal care and food, distributed to retailers and sold direct through our online store."
            />

            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {company.categories.map((category, index) => {
                const Icon = categoryIcons[index % categoryIcons.length];
                return (
                  <article
                    key={category.title}
                    className="group rounded-xl border border-border bg-bg p-5 transition-[box-shadow,translate,border-color] duration-(--duration-fast) ease-(--ease-standard) hover:border-border-hi hover:shadow-e2 motion-safe:hover:-translate-y-px"
                  >
                    <span className="grid size-10 place-items-center rounded-lg bg-accent-soft text-accent-ink transition-colors duration-(--duration-fast) group-hover:bg-accent group-hover:text-white">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <h3 className="mt-4 text-h3">{category.title}</h3>
                    <p className="mt-2 text-small text-text-2">{category.blurb}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------
          Brands — names only. A mark belongs to its owner.
          --------------------------------------------------------------- */}
      {hasContent.brands ? (
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-content-max px-4 py-14 sm:px-6">
            <p className="text-overline uppercase text-accent-ink">
              Among the brands we distribute
            </p>
            <ul className="mt-5 flex flex-wrap gap-2.5">
              {company.brands.map((brand) => (
                <li
                  key={brand}
                  className="rounded-pill border border-border bg-bg px-4 py-2 text-body font-medium text-text-2"
                >
                  {brand}
                </li>
              ))}
            </ul>
            <p className="mt-4 max-w-[70ch] text-small text-text-2">
              Set as text rather than logos: a brand mark belongs to its owner,
              and appearing in a distributor&rsquo;s catalogue is not permission
              to reproduce it here.
            </p>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------
          What we do.
          --------------------------------------------------------------- */}
      {hasContent.services ? (
        <section className="border-b border-border bg-bg">
          <div className="mx-auto max-w-content-max px-4 py-16 sm:px-6">
            <Heading eyebrow="How we work" title="What we do" />

            <div className="mt-8 grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {company.services.map((service, index) => {
                const Icon = serviceIcons[index % serviceIcons.length];
                return (
                  <div key={service.title} className="flex gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-h3">{service.title}</h3>
                      <p className="mt-1.5 max-w-[52ch] text-small text-text-2">
                        {service.summary}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------
          Values — the company's own words, not rewritten into marketing.
          --------------------------------------------------------------- */}
      {hasContent.values ? (
        <section className="border-b border-border bg-surface">
          <div className="mx-auto max-w-content-max px-4 py-16 sm:px-6">
            <Heading
              eyebrow="How we trade"
              title="What the business says it stands for"
              body="Taken from the company's own account of itself, in its own terms."
            />
            <ul className="mt-8 flex flex-wrap gap-3">
              {company.values.map((value) => (
                <li
                  key={value}
                  className="min-w-[14rem] flex-1 border-l-2 border-accent bg-bg py-3 pl-4 pr-3 text-body text-text-2"
                >
                  {value}
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------
          Careers.
          --------------------------------------------------------------- */}
      <section className="bg-brand-700 text-white">
        <div className="mx-auto flex max-w-content-max flex-wrap items-center justify-between gap-6 px-4 py-14 sm:px-6">
          <div>
            <h2 className="text-h1">
              {openRoles > 0
                ? `We're hiring — ${openRoles} open ${openRoles === 1 ? "role" : "roles"}`
                : "Work with us"}
            </h2>
            <p className="mt-2 max-w-[56ch] text-body text-brand-100">
              {company.careersTeaser}
            </p>
          </div>
          <Link
            href="/careers"
            className={buttonVariants({ variant: "accent", size: "lg" })}
          >
            View careers
            <ArrowRight aria-hidden />
          </Link>
        </div>
      </section>
    </>
  );
}

function Figure({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="bg-brand-800/80 p-5">
      <dt className="text-overline uppercase text-brand-200">{label}</dt>
      <dd className="mt-1 font-mono text-h1" data-numeric>
        {value}
        {/* Inside the <dd>, not beside it: a <div> within a <dl> may contain
            only <dt> and <dd>, and a stray <p> broke the list semantics. */}
        {note ? (
          <span className="mt-0.5 block font-sans text-small text-brand-200">
            {note}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function Heading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="max-w-[58ch]">
      <p className="text-overline uppercase text-accent-ink">{eyebrow}</p>
      <h2 className="mt-2 text-h1">{title}</h2>
      {body ? <p className="mt-3 text-body text-text-2">{body}</p> : null}
    </div>
  );
}
