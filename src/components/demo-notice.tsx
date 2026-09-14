import { company } from "@/content/company";

/**
 * The demonstration banner.
 *
 * This deployment carries a real company's name on a public URL that the
 * company did not commission. Without a notice it is indistinguishable from
 * their official site, so the notice is not decoration — it is the thing that
 * makes publishing the name defensible. See src/content/company.ts.
 *
 * Rendered on every publicly reachable surface. Returns null when
 * `company.demo.isDemo` is false, which is the state for a deployment the
 * client has actually asked for on a domain they control.
 */
export function DemoNotice() {
  if (!company.demo.isDemo) return null;

  return (
    <div
      role="note"
      className="border-b border-warn-border bg-warn-bg"
    >
      <p className="mx-auto max-w-content-max px-4 py-2 text-small text-warn-fg sm:px-6">
        <span className="font-semibold">{company.demo.label}.</span>{" "}
        {company.demo.notice}
      </p>
    </div>
  );
}
