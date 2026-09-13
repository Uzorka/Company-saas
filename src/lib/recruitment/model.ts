import type { StatusTone } from "@/lib/status";

/** Eight stages. Source: Phase 6, const STAGES. */
export const STAGES = [
  "applied",
  "screening",
  "shortlisted",
  "interview",
  "offered",
  "hired",
  "rejected",
  "withdrawn",
] as const;
export type Stage = (typeof STAGES)[number];

export const stageLabel: Record<Stage, string> = {
  applied: "Applied",
  screening: "Screening",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offered: "Offered",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const stageTone: Record<Stage, StatusTone> = {
  applied: "mute",
  screening: "info",
  shortlisted: "info",
  interview: "warn",
  offered: "success",
  hired: "success",
  rejected: "danger",
  withdrawn: "mute",
};

/**
 * Columns on the pipeline board.
 *
 * Rejected and withdrawn are included deliberately: the design keeps them
 * visible rather than sweeping them away, and candidates stay searchable for
 * twelve months. Hiding them would make the funnel look better than it is.
 */
export const BOARD_STAGES: Stage[] = [...STAGES];

/**
 * Stages a person can be moved *to* from the board.
 *
 * `hired` is absent on purpose. The design: "Dragging into Hired opens the
 * convert flow rather than silently moving." Hiring creates an employee
 * record; it is not a status change.
 */
export const MOVABLE_STAGES: Stage[] = STAGES.filter((s) => s !== "hired");

/** Stages that end the process. Used to grey a card rather than remove it. */
export function isTerminal(stage: Stage): boolean {
  return stage === "hired" || stage === "rejected" || stage === "withdrawn";
}
