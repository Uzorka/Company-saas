import Link from "next/link";
import { CreatePeriod } from "./create-period";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState, EmptyState } from "@/components/states";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import { listPeriods } from "@/lib/payroll/queries";
import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { payrollStatusLabel, payrollStatusTone } from "@/lib/payroll/model";
import { formatDate } from "@/lib/employees/display";

export const metadata = { title: "Payroll" };

export default async function PayrollPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  if (!can(session, "payroll.view_all")) {
    return (
      <PermissionState
        module="Payroll"
        roles={MODULE_ROLES.Payroll.map((role) => ROLE_LABELS[role])}
      />
    );
  }

  const { rows, error } = await listPeriods();

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load payroll"
        body="The request failed. Your data is safe."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1">Payroll</h1>
          <p className="mt-1 max-w-[68ch] text-body text-text-2">
            Each period runs draft → processing → review → approved → published
            → closed. Whoever sends a run for review cannot be the one who
            approves it, and publishing cannot be undone.
          </p>
        </div>
        {can(session, "payroll.create") ? <CreatePeriod org={org} /> : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          heading="No payroll periods yet"
          body="A period covers one pay cycle. Creating one generates a line for every active employee from their current compensation."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((period) => (
            <li key={period.id}>
              <Link href={`/${org}/payroll/${period.id}`}>
                <Card interactive>
                  <CardBody className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-h3">{period.label}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-text-3">
                        {formatDate(period.starts_on)} → {formatDate(period.ends_on)}
                        {period.pay_date ? ` · pays ${formatDate(period.pay_date)}` : ""}
                      </p>
                    </div>
                    <StatusPill tone={payrollStatusTone[period.status]}>
                      {payrollStatusLabel[period.status]}
                    </StatusPill>
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
