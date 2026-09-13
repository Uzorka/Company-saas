import Link from "next/link";
import { MapPin, Briefcase } from "lucide-react";
import { company } from "@/content/company";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Card, CardBody } from "@/components/ui/card";
import { employmentTypeLabel, formatDate } from "@/lib/employees/display";

export const metadata = { title: "Careers" };

/**
 * Careers. Source: Phase 2 - Public Website.
 *
 * Reads published jobs as an anonymous visitor — that is the one public read
 * policy in the product, and it filters to `published` in the policy itself
 * rather than here, so a draft role cannot leak through a forgotten filter.
 */
export default async function CareersPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto max-w-content-max px-4 py-14 sm:px-6">
        <h1 className="text-h1">Careers</h1>
        <p className="mt-3 text-body text-text-2">
          Open roles will be listed here shortly.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, title, slug, location, employment_type, summary, closes_on")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  const roles = jobs ?? [];

  return (
    <div className="mx-auto max-w-content-max px-4 py-14 sm:px-6">
      <h1 className="text-h1">Careers</h1>
      <p className="mt-3 max-w-[60ch] text-body text-text-2">
        {company.careersIntro}
      </p>

      {roles.length === 0 ? (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-h3">No open roles right now</h2>
          <p className="mt-2 max-w-[60ch] text-body text-text-2">
            {company.careersEmptyNote}
          </p>
        </div>
      ) : (
        <ul className="mt-8 flex flex-col gap-3">
          {roles.map((role) => (
            <li key={role.id}>
              <Link href={`/careers/${role.slug}`}>
                <Card interactive>
                  <CardBody>
                    <h2 className="text-h3">{role.title}</h2>
                    {role.summary ? (
                      <p className="mt-1 max-w-[70ch] text-small text-text-2">
                        {role.summary}
                      </p>
                    ) : null}
                    <p className="mt-3 flex flex-wrap items-center gap-3 text-small text-text-3">
                      {role.location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-4" aria-hidden />
                          {role.location}
                        </span>
                      ) : null}
                      <span className="flex items-center gap-1">
                        <Briefcase className="size-4" aria-hidden />
                        {employmentTypeLabel[role.employment_type] ??
                          role.employment_type}
                      </span>
                      {role.closes_on ? (
                        <span className="font-mono text-[11px]">
                          closes {formatDate(role.closes_on)}
                        </span>
                      ) : null}
                    </p>
                  </CardBody>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
