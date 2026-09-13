import Link from "next/link";
import { company, hasContent } from "@/content/company";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Home. Source: Phase 2.
 *
 * Sections render only when they have content, so the page is short and
 * truthful rather than padded with invented claims. See src/content/company.ts.
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

  return (
    <>
      <section className="mx-auto max-w-content-max px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="max-w-[20ch] text-display">{company.heroHeading}</h1>
        <p className="mt-4 max-w-[60ch] text-body text-text-2">
          {company.heroBody}
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/careers" className={buttonVariants({ size: "lg" })}>
            {openRoles > 0
              ? `See ${openRoles} open ${openRoles === 1 ? "role" : "roles"}`
              : "Careers"}
          </Link>
          <Link
            href="/contact"
            className={buttonVariants({ variant: "secondary", size: "lg" })}
          >
            Get in touch
          </Link>
        </div>
      </section>

      {hasContent.services ? (
        <section className="border-t border-border bg-surface">
          <div className="mx-auto max-w-content-max px-4 py-14 sm:px-6">
            <h2 className="text-h2">What we do</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {company.services.map((service) => (
                <div
                  key={service.title}
                  className="rounded-xl border border-border bg-bg p-5"
                >
                  <h3 className="text-h3">{service.title}</h3>
                  <p className="mt-2 text-small text-text-2">{service.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
