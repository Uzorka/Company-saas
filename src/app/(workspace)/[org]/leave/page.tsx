import Link from "next/link";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState, EmptyState } from "@/components/states";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import { listMyLeave, listMyBalances } from "@/lib/leave/queries";
import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import { Timeline } from "@/components/ui/timeline";
import {
  buildLeaveTimeline,
  leaveStatusShort,
  leaveStatusTone,
} from "@/lib/leave/model";
import { formatDate } from "@/lib/employees/display";

export const metadata = { title: "Leave" };

/**
 * Leave. Source: Phase 5 - Leave.
 *
 * Balance first, then the requests. The design puts the balance above the
 * form deliberately: knowing what you have left is what shapes the request.
 */
export default async function LeavePage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  if (!can(session, "leave.view_self") && !can(session, "leave.view_all")) {
    return (
      <PermissionState
        module="Leave"
        roles={MODULE_ROLES.Leave.map((role) => ROLE_LABELS[role])}
      />
    );
  }

  const [{ rows, error }, balances] = await Promise.all([
    listMyLeave(),
    listMyBalances(),
  ]);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load your leave"
        body="The request failed. Your data is safe."
      />
    );
  }

  const canApprove =
    can(session, "leave.approve_department") || can(session, "leave.approve_hr");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1">Leave</h1>
          <p className="mt-1 text-body text-text-2">
            Your balance and requests
          </p>
        </div>
        {canApprove ? (
          <Link
            href={`/${org}/leave/approvals`}
            className={buttonVariants({ variant: "secondary" })}
          >
            Approval queue
          </Link>
        ) : null}
      </div>

      {balances.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {balances.map((balance) => {
            const left = Number(balance.entitled_days) - Number(balance.taken_days);
            return (
              <Card key={balance.leave_type?.id ?? balance.leave_type?.name}>
                <CardBody className="p-4 sm:p-4">
                  <p className="truncate text-small text-text-3">
                    {balance.leave_type?.name}
                  </p>
                  <p className="mt-1 font-mono text-h2" data-numeric>
                    {left}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-text-3">
                    of {Number(balance.entitled_days)} days
                  </p>
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardBody className="text-body text-text-2">
            No leave balance has been set up for you yet. HR allocates
            entitlements at the start of each leave year.
          </CardBody>
        </Card>
      )}

      {rows.length === 0 ? (
        <EmptyState
          heading="No leave requests yet"
          body="When you request leave it appears here, showing exactly which stage it's waiting on and how long it has been there."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <CardBody className="flex flex-wrap gap-5">
                  <div className="min-w-[200px] flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-h3">{row.leave_type?.name}</p>
                      <StatusPill tone={leaveStatusTone[row.status]}>
                        {leaveStatusShort[row.status]}
                      </StatusPill>
                      {row.leave_type && !row.leave_type.paid ? (
                        <StatusPill tone="mute">Unpaid</StatusPill>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-small text-text-2">
                      {formatDate(row.starts_on)} → {formatDate(row.ends_on)} ·{" "}
                      {Number(row.days_requested)} days
                    </p>
                    {row.reason ? (
                      <p className="mt-2 text-small text-text-2">{row.reason}</p>
                    ) : null}
                  </div>

                  <div className="min-w-[220px]">
                    <Timeline
                      nodes={buildLeaveTimeline({
                        status: row.status,
                        approvals: row.approvals ?? [],
                        // A request that never had an HOD stage shows three
                        // nodes, not four with a permanent gap.
                        routedToHod:
                          (row.approvals ?? []).some((a) => a.stage === "hod") ||
                          row.status === "pending_hod",
                        submittedAt: row.submitted_at,
                      })}
                    />
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
