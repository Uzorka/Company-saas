import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState, EmptyState } from "@/components/states";
import { listPendingApprovals } from "@/lib/leave/queries";
import { ApprovalQueue } from "./queue";

export const metadata = { title: "Leave approvals" };

/**
 * The approval queue, oldest first. Source: Phase 5 — "sorted by wait time".
 *
 * An HOD sees only their department's requests and only at the HOD stage;
 * HR sees what has reached them. Both come from the same query — the
 * difference is RLS plus the stage check inside decide_leave_request().
 */
export default async function LeaveApprovalsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  const canApprove =
    can(session, "leave.approve_department") || can(session, "leave.approve_hr");

  if (!canApprove) {
    return (
      <PermissionState
        module="Leave approvals"
        roles={["Heads of Department", "HR", "Management"]}
      />
    );
  }

  const { rows, error } = await listPendingApprovals();

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load the approval queue"
        body="The request failed. Your data is safe."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1">Leave approvals</h1>
        <p className="mt-1 max-w-[68ch] text-body text-text-2">
          Oldest first. Approving at the head-of-department stage passes the
          request to HR — the balance only moves once HR gives final approval.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          heading="No leave requests waiting"
          body="When your team submits leave it lands here for approval, with how long it has been waiting."
        />
      ) : (
        <ApprovalQueue
          rows={rows}
          isHr={can(session, "leave.approve_hr")}
        />
      )}
    </div>
  );
}
