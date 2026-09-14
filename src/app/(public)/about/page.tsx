import { company, hasContent } from "@/content/company";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-content-max px-4 py-14 sm:px-6">
      <h1 className="text-h1">About {company.name}</h1>
      <p className="mt-3 max-w-[65ch] text-body text-text-2">
        {company.tagline}
      </p>

      {hasContent.leadership ? (
        <section className="mt-12">
          <h2 className="text-h2">Leadership</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {company.leadership.map((person) => (
              <div
                key={person.name}
                className="rounded-xl border border-border p-5"
              >
                <p className="text-h3">{person.name}</p>
                <p className="mt-0.5 text-small text-text-2">{person.role}</p>
                {person.bio ? (
                  <p className="mt-2 text-small text-text-2">{person.bio}</p>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-10 rounded-xl border border-border bg-surface p-6">
          <h2 className="text-h3">Leadership</h2>
          <p className="mt-2 max-w-[60ch] text-small text-text-2">
            Not published here. Naming a company&rsquo;s executives on a site
            they did not commission puts identifiable people on a page they
            never agreed to appear on.
          </p>
        </section>
      )}
    </div>
  );
}
