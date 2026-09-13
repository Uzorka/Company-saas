import type { StatusTone } from "@/lib/status";

/**
 * Task vocabulary, mirroring supabase/migrations/0016_tasks.sql.
 *
 * The verification modes are the heart of the module: proof is required only
 * where it means something. The design is explicit that forcing field
 * verification on desk work is wrong, so `none` is a first-class mode and the
 * default — not an oversight.
 */
export const TASK_STATUSES = [
  "todo",
  "in_progress",
  "review",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const VERIFICATION_MODES = [
  "none",
  "photo",
  "location",
  "photo_location",
  "photo_location_report",
] as const;
export type VerificationMode = (typeof VERIFICATION_MODES)[number];

export const statusLabel: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const statusTone: Record<TaskStatus, StatusTone> = {
  todo: "mute",
  in_progress: "info",
  review: "warn",
  completed: "success",
  cancelled: "mute",
};

/** Columns on the board. Cancelled is deliberately absent — it is a filter,
 *  not a lane, or every board slowly fills with abandoned work. */
export const BOARD_COLUMNS: TaskStatus[] = [
  "todo",
  "in_progress",
  "review",
  "completed",
];

export const priorityLabel: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const priorityTone: Record<TaskPriority, StatusTone> = {
  low: "mute",
  medium: "info",
  high: "warn",
  urgent: "danger",
};

/** Source: const VER in Phase 5. The descriptions are the design's own. */
export const verificationMode: Record<
  VerificationMode,
  { label: string; description: string; needsPhoto: boolean; needsLocation: boolean; needsReport: boolean }
> = {
  none: {
    label: "No proof",
    description: "Marked done by the assignee. Trust-based, for desk work.",
    needsPhoto: false,
    needsLocation: false,
    needsReport: false,
  },
  photo: {
    label: "Photo",
    description: "One photo taken at the moment of completion.",
    needsPhoto: true,
    needsLocation: false,
    needsReport: false,
  },
  location: {
    label: "Location",
    description: "A single position reading when the task is closed.",
    needsPhoto: false,
    needsLocation: true,
    needsReport: false,
  },
  photo_location: {
    label: "Photo + GPS",
    description: "Photo and position captured together, at the site.",
    needsPhoto: true,
    needsLocation: true,
    needsReport: false,
  },
  photo_location_report: {
    label: "Photo + GPS + report",
    description:
      "Photo, position and a written report. For audits and stock counts.",
    needsPhoto: true,
    needsLocation: true,
    needsReport: true,
  },
};

export const VISIT_STATES = [
  "assigned",
  "submitted",
  "verified",
  "returned",
  "flagged",
] as const;
export type VisitState = (typeof VISIT_STATES)[number];

export const visitStateLabel: Record<VisitState, string> = {
  assigned: "Not started",
  submitted: "Awaiting review",
  verified: "Verified",
  returned: "Returned",
  flagged: "Needs a look",
};

export const visitStateTone: Record<VisitState, StatusTone> = {
  assigned: "mute",
  submitted: "info",
  verified: "success",
  returned: "danger",
  flagged: "warn",
};

/**
 * Whether a task is overdue. Compared on calendar date, not timestamp: a task
 * due today is not overdue at 09:00, and treating it as such would make every
 * morning look like a crisis.
 */
export function isOverdue(
  dueDate: string | null,
  status: TaskStatus,
  today = new Date(),
): boolean {
  if (!dueDate) return false;
  if (status === "completed" || status === "cancelled") return false;

  const due = new Date(`${dueDate}T00:00:00`);
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  return due < todayMidnight;
}
