import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState, EmptyState } from "@/components/states";
import { listVisitsAwaitingReview } from "@/lib/tasks/queries";
import { ReviewQueue } from "./queue";

export const metadata = { title: "Visit review" };

/**
 * The HOD review queue. Source: Phase 5, HOD REVIEW.
 *
 * Only submitted and flagged visits appear. A decided visit leaves the queue,
 * because a queue that never empties stops being read.
 */
export default async function VisitReviewPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  if (!can(session, "tasks.verify_visit")) {
    return (
      <PermissionState
        module="Visit review"
        roles={["Heads of Department", "Management"]}
      />
    );
  }

  const { rows, error } = await listVisitsAwaitingReview();

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load the review queue"
        body="The request failed. Your data is safe."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-h1">Visit review</h1>
        <p className="mt-1 max-w-[68ch] text-body text-text-2">
          Visits waiting on a decision. Accepting one closes it; returning one
          keeps the original evidence and sends the reason back to the
          assignee.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          heading="Nothing waiting"
          body="When someone submits a field visit it lands here with its distance, accuracy and report, ready to accept or return."
        />
      ) : (
        <ReviewQueue rows={rows} />
      )}
    </div>
  );
}
