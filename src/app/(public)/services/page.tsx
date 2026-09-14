import Link from "next/link";
import { company, hasContent } from "@/content/company";

export const metadata = { title: "Services" };

export default function ServicesPage() {
  return (
    <div className="mx-auto max-w-content-max px-4 py-14 sm:px-6">
      <h1 className="text-h1">Services</h1>

      {hasContent.services ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {company.services.map((service) => (
            <div key={service.title} className="rounded-xl border border-border p-6">
              <h2 className="text-h3">{service.title}</h2>
              <p className="mt-2 text-body text-text-2">{service.summary}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-8 rounded-xl border border-border bg-surface p-6">
          <p className="max-w-[60ch] text-body text-text-2">
            Detail on what we offer is being prepared for this page. To ask
            about a specific service,{" "}
            <Link href="/contact" className="text-brand-600 underline underline-offset-2">
              get in touch
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
