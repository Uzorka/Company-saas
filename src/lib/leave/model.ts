import type { StatusTone } from "@/lib/status";
import type { TimelineNode } from "@/components/ui/timeline";

/**
 * Leave vocabulary, mirroring supabase/migrations/0019_leave.sql.
 */
export const LEAVE_STATUSES = [
  "draft",
  "pending_hod",
  "pending_hr",
  "approved",
  "declined",
  "cancelled",
] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const leaveStatusLabel: Record<LeaveStatus, string> = {
  draft: "Draft",
  pending_hod: "Awaiting your head of department",
  pending_hr: "Awaiting HR",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

/** Short form, for a pill in a dense row. */
export const leaveStatusShort: Record<LeaveStatus, string> = {
  draft: "Draft",
  pending_hod: "With HOD",
  pending_hr: "With HR",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};

export const leaveStatusTone: Record<LeaveStatus, StatusTone> = {
  draft: "mute",
  pending_hod: "info",
  pending_hr: "warn",
  approved: "success",
  declined: "danger",
  cancelled: "mute",
};

export type ApprovalRecord = {
  stage: "hod" | "hr";
  decision: "approved" | "declined";
  note: string | null;
  decided_at: string;
  approver?: string | null;
};

/**
 * Build the approval chain for display.
 *
 * `routedToHod` matters: a request from someone with no head of department
 * never had an HOD stage, and showing a permanently-empty node would imply a
 * step is missing rather than not applicable.
 */
export function buildLeaveTimeline({
  status,
  approvals,
  routedToHod,
  submittedAt,
  now = new Date(),
}: {
  status: LeaveStatus;
  approvals: ApprovalRecord[];
  routedToHod: boolean;
  submittedAt: string | null;
  now?: Date;
}): TimelineNode[] {
  const nodes: TimelineNode[] = [
    {
      label: "Submitted",
      state: submittedAt ? "done" : "todo",
      detail: submittedAt ? formatWhen(submittedAt) : undefined,
    },
  ];

  const hod = approvals.find((a) => a.stage === "hod");
  const hr = approvals.find((a) => a.stage === "hr");

  if (routedToHod) {
    nodes.push({
      label: "Head of department",
      state: hod
        ? hod.decision === "declined"
          ? "rejected"
          : "done"
        : status === "pending_hod"
          ? "active"
          : "todo",
      detail: hod?.note ?? undefined,
      waiting:
        status === "pending_hod" && submittedAt
          ? waitedFor(submittedAt, now)
          : undefined,
    });
  }

  nodes.push({
    label: "HR",
    state: hr
      ? hr.decision === "declined"
        ? "rejected"
        : "done"
      : status === "pending_hr"
        ? "active"
        : "todo",
    detail: hr?.note ?? undefined,
    waiting:
      status === "pending_hr"
        ? waitedFor(hod?.decided_at ?? submittedAt, now)
        : undefined,
  });

  nodes.push({
    label:
      status === "declined"
        ? "Declined"
        : status === "cancelled"
          ? "Cancelled"
          : "Approved",
    state:
      status === "approved"
        ? "done"
        : status === "declined"
          ? "rejected"
          : "todo",
  });

  return nodes;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** How long a stage has been waiting, in the plainest words available. */
export function waitedFor(since: string | null, now = new Date()): string | undefined {
  if (!since) return undefined;
  const ms = now.getTime() - new Date(since).getTime();
  if (Number.isNaN(ms) || ms < 0) return undefined;

  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `waiting ${days} ${days === 1 ? "day" : "days"}`;

  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `waiting ${hours} ${hours === 1 ? "hour" : "hours"}`;
  return "waiting less than an hour";
}
