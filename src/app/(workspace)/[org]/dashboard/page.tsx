import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { navByRole, pickPrimaryRole } from "@/lib/navigation";
import { Card, CardBody } from "@/components/ui/card";

export const metadata = { title: "Dashboard" };

/**
 * Dashboard.
 *
 * This replaces the Phase 1 component gallery that was left here by mistake —
 * a page headed "Phase 1 / Foundation" showing buttons labelled Primary and
 * Secondary, which is what every user saw on landing.
 *
 * It is deliberately a launcher rather than the five role dashboards the brief
 * specifies. Those need figures — today's attendance, pending approvals, the
 * payroll position — and the honest version of a figure nobody has computed is
 * not a zero on a card, it is no card. So this shows what the signed-in user
 * can actually open, and says plainly what is still coming. The real
 * dashboards land with the reporting work; see docs/BACKLOG.md.
 */
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  const role = pickPrimaryRole(session.roles);
  const items = navByRole[role];

  // Same rule as the sidebar: built, and the caller holds the permission.
  // Authority is enforced server-side and in RLS — this only decides what to
  // put on screen.
  const open = items.filter(
    (item) =>
      item.built &&
      item.href !== "/dashboard" &&
      (item.permission === undefined || session.permissions.has(item.permission)),
  );
  const soon = items.filter((item) => !item.built);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-overline uppercase text-text-3">
          {ROLE_LABELS[role]}
        </p>
        <h1 className="mt-1 text-h1">Welcome back</h1>
        <p className="mt-2 max-w-[68ch] text-body text-text-2">
          {open.length > 0
            ? "Everything your role can reach is below, and in the sidebar."
            : "Your role does not open any modules yet. Ask an administrator to review your permissions."}
        </p>
      </div>

      {open.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {open.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.label}>
                <Link
                  href={`/${org}${item.href}`}
                  className="block rounded-xl transition-colors duration-(--duration-fast) hover:bg-surface"
                >
                  <Card>
                    <CardBody className="flex items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                        <Icon className="size-[18px]" aria-hidden />
                      </span>
                      <span className="text-h3">{item.label}</span>
                    </CardBody>
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      {soon.length > 0 ? (
        <section className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-h3">Not built yet</h2>
          <p className="mt-1.5 max-w-[60ch] text-small text-text-2">
            These are part of the product and appear in your sidebar marked
            &ldquo;Soon&rdquo;. They are listed here so nothing on this screen
            pretends to be finished.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {soon.map((item) => (
              <li
                key={item.label}
                className="rounded-pill border border-border bg-bg px-2.5 py-1 text-small text-text-3"
              >
                {item.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
