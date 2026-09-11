import type { StatusTone } from "@/lib/status";
import type { EmployeeStatus } from "./queries";

/**
 * Employment status presentation. Source: Phase 4, const PILL.
 *
 * Every status carries a tone, a glyph (supplied by StatusPill) and a word.
 * Deactivated people are shown greyed with the status stated — never removed
 * from the list, because the design forbids deleting a person.
 */
export const employmentStatusTone: Record<EmployeeStatus, StatusTone> = {
  active: "success",
  probation: "warn",
  leave: "mute",
  suspended: "danger",
  exited: "danger",
};

export const employmentStatusLabel: Record<EmployeeStatus, string> = {
  active: "Active",
  probation: "Probation",
  leave: "On leave",
  suspended: "Suspended",
  exited: "Exited",
};

export const employmentTypeLabel: Record<string, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  intern: "Intern",
  nysc: "NYSC",
};

export function fullName(employee: {
  first_name: string;
  last_name: string;
}): string {
  return `${employee.first_name} ${employee.last_name}`;
}

/**
 * Dates render as "12 Jan 2022" throughout, matching the design. Fixed to
 * en-GB rather than the viewer's locale so a date never reads as 01/12 in one
 * place and 12/01 in another — an ambiguity that matters on a hire date.
 */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}
