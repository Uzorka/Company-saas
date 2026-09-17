import Link from "next/link";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState, EmptyState } from "@/components/states";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { listAudit, auditFacets, AUDIT_PAGE_SIZE } from "@/lib/audit/queries";
import { Card, CardBody } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { AuditFilters } from "./filters";
import { auditActionLabel, auditTone, describeEntry } from "@/lib/audit/model";
import { StatusPill } from "@/components/ui/status-pill";
import { Reveal } from "@/components/ui/reveal";
import { ExportButton } from "@/components/export-button";

export const metadata = { title: "Audit log" };

/**
 * Audit log. Source: Phase 9 — administration.
 *
 * Read-only, and structurally so: `audit_logs` has no insert policy for any
 * application role, and a trigger rejects every update and delete. There is no
 * edit control on this screen because there is nothing the product could
 * offer — the brief's rule is that ordinary users never edit audit history,
 * and that is enforced two layers below this component.
 *
 * The log is append-only and unbounded, so this pages rather than scrolls.
 */
export default async function AuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{
    action?: string;
    entity?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  if (!can(session, "audit.view")) {
    return (
      <PermissionState
        module="Audit log"
        roles={[ROLE_LABELS.management]}
      />
    );
  }

  const sp = await searchParams;
  const page = Math.max(0, Number.parseInt(sp.page ?? "0", 10) || 0);
  const filters = {
    action: sp.action || undefined,
    entity: sp.entity || undefined,
    from: sp.from || undefined,
    to: sp.to || undefined,
  };

  const [{ rows, total, error }, facets] = await Promise.all([
    listAudit(filters, page),
    auditFacets(),
  ]);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load the audit log"
        body="The request failed. Nothing has changed."
      />
    );
  }

  const isFiltered = Object.values(filters).some(Boolean);
  const lastPage = Math.max(0, Math.ceil(total / AUDIT_PAGE_SIZE) - 1);

  function pageHref(next: number) {
    const qs = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) qs.set(key, value);
    }
    if (next > 0) qs.set("page", String(next));
    const query = qs.toString();
    return `/${org}/audit${query ? `?${query}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
        <h1 className="text-h1">Audit log</h1>
        <p className="mt-1 max-w-[70ch] text-body text-text-2">
          Every recorded action, oldest at the bottom. Entries cannot be edited
          or removed by anyone, including an administrator — the database
          refuses it.
        </p>
        </div>
        <ExportButton org={org} dataset="audit" />
      </div>

      <AuditFilters
        org={org}
        actions={facets.actions}
        entities={facets.entities}
        current={filters}
      />

      {rows.length === 0 ? (
        <EmptyState
          heading={isFiltered ? "Nothing matches those filters" : "Nothing recorded yet"}
          body={
            isFiltered
              ? "Try a wider date range, or clear the filters."
              : "Actions appear here as they happen — check-ins, leave decisions, payroll steps, and anything created or published."
          }
          action={
            isFiltered ? (
              <Link
                href={`/${org}/audit`}
                className={buttonVariants({ variant: "secondary" })}
              >
                Clear filters
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-small text-text-3">
            {total.toLocaleString()} {total === 1 ? "entry" : "entries"}
            {isFiltered ? " matching your filters" : ""}
            {lastPage > 0 ? ` · page ${page + 1} of ${lastPage + 1}` : ""}
          </p>

          <ol className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <li key={row.id}>
                <Reveal index={index}>
                <Card interactive>
                  <CardBody className="flex flex-wrap items-start gap-x-4 gap-y-2 py-3">
                    <StatusPill tone={auditTone(row.action)}>
                      {auditActionLabel(row.action)}
                    </StatusPill>

                    <div className="min-w-[220px] flex-1">
                      <p className="text-small">{describeEntry(row)}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-text-3">
                        {row.entity_type}
                        {row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ""}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-small">
                        {row.actor?.full_name ?? (
                          <span className="text-text-3">System</span>
                        )}
                      </p>
                      <time
                        className="font-mono text-[11px] text-text-3"
                        dateTime={row.created_at}
                      >
                        {new Date(row.created_at).toLocaleString("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </time>
                    </div>
                  </CardBody>
                </Card>
                </Reveal>
              </li>
            ))}
          </ol>

          {lastPage > 0 ? (
            <nav className="flex items-center justify-between gap-3" aria-label="Pages">
              {page > 0 ? (
                <Link
                  href={pageHref(page - 1)}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Newer
                </Link>
              ) : (
                <span />
              )}
              {page < lastPage ? (
                <Link
                  href={pageHref(page + 1)}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  Older
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
