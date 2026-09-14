import type { AuditRow } from "./queries";

/**
 * Presentation for audit entries. No queries, no side effects — this is the
 * layer that turns `payroll.approved` into something a person reads.
 */

/** "payroll.approved" → "Payroll". The module is what a reader scans by. */
export function auditActionLabel(action: string): string {
  const [module] = action.split(".");
  return module.charAt(0).toUpperCase() + module.slice(1).replace(/_/g, " ");
}

/**
 * Tone by consequence, not by module.
 *
 * Publishing payslips and publishing a job are irreversible and public
 * respectively; a check-in is routine. Colouring by module would make the
 * whole payroll section red and teach people to ignore it.
 */
export function auditTone(
  action: string,
): "success" | "warn" | "danger" | "info" | "mute" {
  if (/\.(published|approved|convert|hired)$/.test(action)) return "success";
  if (/\.(declined|rejected|returned|cancel|withdrawn)$/.test(action)) return "danger";
  if (/\.(create|submit)$/.test(action)) return "info";
  if (/\.(review|flagged)$/.test(action)) return "warn";
  return "mute";
}

/**
 * A sentence describing the entry.
 *
 * Falls back to the raw action rather than inventing wording for an action
 * this function has not been taught. A log that paraphrases something it does
 * not understand is a log you cannot trust.
 */
export function describeEntry(row: AuditRow): string {
  const meta = row.metadata ?? {};
  const label =
    (typeof meta.label === "string" && meta.label) ||
    (typeof meta.title === "string" && meta.title) ||
    null;

  const verb = row.action.split(".").slice(1).join(".") || row.action;

  const readable: Record<string, string> = {
    create: "created",
    submit: "submitted",
    approved: "approved",
    declined: "declined",
    published: "published",
    closed: "closed",
    calculate: "recalculated",
    review: "sent for review",
    cancel: "cancelled",
    check_in: "checked in",
    check_out: "checked out",
    convert: "converted to an employee",
    stage: "moved to a new stage",
    draft: "returned to draft",
  };

  const phrase = readable[verb] ?? verb.replace(/_/g, " ");
  const subject = label ? ` — ${label}` : "";

  return `${entityNoun(row.entity_type)} ${phrase}${subject}`;
}

/** "payroll_periods" → "Payroll period". */
function entityNoun(entity: string): string {
  const singular = entity.endsWith("s") ? entity.slice(0, -1) : entity;
  const words = singular.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
