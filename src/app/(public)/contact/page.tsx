import { company, hasContent } from "@/content/company";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-content-max px-4 py-14 sm:px-6">
      <h1 className="text-h1">Contact</h1>
      <p className="mt-3 max-w-[60ch] text-body text-text-2">
        {company.contact.enquiryNote}
      </p>

      {hasContent.contactDetails ? (
        <dl className="mt-8 flex flex-col gap-3">
          {company.contact.email ? (
            <div>
              <dt className="text-overline uppercase text-text-3">Email</dt>
              <dd className="mt-0.5 text-body">
                <a
                  href={`mailto:${company.contact.email}`}
                  className="text-brand-600 hover:underline"
                >
                  {company.contact.email}
                </a>
              </dd>
            </div>
          ) : null}
          {company.contact.phone ? (
            <div>
              <dt className="text-overline uppercase text-text-3">Phone</dt>
              <dd className="mt-0.5 font-mono text-body">{company.contact.phone}</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <p className="max-w-[60ch] text-body text-text-2">
            Contact details are being confirmed and will appear here. The
            enquiry form arrives alongside them — a form that goes nowhere is
            worse than no form.
          </p>
        </div>
      )}

      {hasContent.offices ? (
        <section className="mt-12">
          <h2 className="text-h2">Offices</h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {company.offices.map((office) => (
              <li key={office.name} className="rounded-xl border border-border p-5">
                <p className="text-h3">{office.name}</p>
                <p className="mt-1 text-small text-text-2">{office.address}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
