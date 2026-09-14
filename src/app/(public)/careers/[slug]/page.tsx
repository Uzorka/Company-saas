import { notFound } from "next/navigation";
import Link from "next/link";
import { MapPin, Briefcase } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { employmentTypeLabel, formatDate } from "@/lib/employees/display";
import { ApplicationForm } from "./application-form";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return { title: slug.replace(/-/g, " ") };
}

export default async function JobPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isSupabaseConfigured()) notFound();

  const { slug } = await params;
  const supabase = await createClient();

  const { data: job } = await supabase
    .from("jobs")
    .select(
      "id, title, location, employment_type, summary, description, responsibilities, requirements, closes_on",
    )
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  // A draft or closed role 404s rather than revealing that it exists.
  if (!job) notFound();

  const closed = job.closes_on ? new Date(job.closes_on) < new Date() : false;

  return (
    <div className="mx-auto max-w-[760px] px-4 py-14 sm:px-6">
      <Link href="/careers" className="text-small text-brand-600 underline underline-offset-2">
        ← All roles
      </Link>

      <h1 className="mt-3 text-h1">{job.title}</h1>

      <p className="mt-3 flex flex-wrap items-center gap-3 text-small text-text-2">
        {job.location ? (
          <span className="flex items-center gap-1">
            <MapPin className="size-4" aria-hidden />
            {job.location}
          </span>
        ) : null}
        <span className="flex items-center gap-1">
          <Briefcase className="size-4" aria-hidden />
          {employmentTypeLabel[job.employment_type] ?? job.employment_type}
        </span>
        {job.closes_on ? (
          <span className="font-mono text-[11px]">
            {closed ? "closed " : "closes "}
            {formatDate(job.closes_on)}
          </span>
        ) : null}
      </p>

      {job.summary ? (
        <p className="mt-6 text-body text-text-2">{job.summary}</p>
      ) : null}

      {job.description ? (
        <Section title="About the role">{job.description}</Section>
      ) : null}
      {job.responsibilities ? (
        <Section title="What you&rsquo;ll do">{job.responsibilities}</Section>
      ) : null}
      {job.requirements ? (
        <Section title="What we need from you">{job.requirements}</Section>
      ) : null}

      <section className="mt-12 border-t border-border pt-8">
        <h2 className="text-h2">Apply</h2>
        {closed ? (
          <p className="mt-3 rounded-lg border border-border bg-surface p-4 text-body text-text-2">
            Applications for this role have closed.
          </p>
        ) : (
          <>
            <p className="mt-2 max-w-[60ch] text-body text-text-2">
              A few minutes, and no account needed. We will only use these
              details to consider your application.
            </p>
            <ApplicationForm jobId={job.id} />
          </>
        )}
      </section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: React.ReactNode;
  children: string;
}) {
  return (
    <section className="mt-8">
      <h2 className="text-h2">{title}</h2>
      {/* Stored as plain text, rendered as paragraphs — never as HTML, since
          this content is edited in an admin form and rendering it as markup
          would make the careers page an injection surface. */}
      <div className="mt-3 flex flex-col gap-3">
        {children
          .split(/\n{2,}/)
          .filter((para) => para.trim())
          .map((para, index) => (
            <p key={index} className="text-body text-text-2">
              {para.trim()}
            </p>
          ))}
      </div>
    </section>
  );
}
