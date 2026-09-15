/**
 * Shared shape for every create/edit form in the workspace.
 *
 * `useActionState` needs a serialisable state object, and every form wants the
 * same three things: an error to show, a success to react to, and nothing else.
 */
export type FormState = {
  error?: string;
  /** Set once the row is written. Forms use it to close and reset. */
  done?: boolean;
  /** Optional id of what was created, for forms that navigate afterwards. */
  id?: string;
};

/**
 * Turn a Postgres error into a sentence a person can act on.
 *
 * Our own functions raise messages written for the reader — "You do not head
 * this employee's department" — and those are worth passing through. Anything
 * that does not look like one is replaced wholesale: an internal error should
 * never reach a user as a raw string, both because it is useless to them and
 * because it can leak schema detail.
 */
export function humanise(message: string): string {
  const cleaned = message.replace(/^ERROR:\s*/i, "").trim();
  const looksIntentional =
    cleaned.length > 0 && cleaned.length < 200 && /^[A-Z]/.test(cleaned);
  return looksIntentional
    ? cleaned
    : "That couldn't be saved. Nothing has changed — try again.";
}

/**
 * Postgres error codes we translate rather than pass through, because the
 * database's own wording for them names columns and constraints.
 */
export function describeWriteError(
  code: string | undefined,
  message: string,
  duplicate: string,
): string {
  if (code === "23505") return duplicate;
  if (code === "23514") return "Some of those values aren't allowed. Check the fields and try again.";
  if (code === "42501" || code === "PGRST301") {
    return "You don't have permission to do that.";
  }
  return humanise(message);
}

/**
 * Did that write actually change anything?
 *
 * RLS refuses a write in two different ways, and only one of them raises.
 * Missing a table privilege raises; a policy that simply matches no rows does
 * not — the statement succeeds having changed nothing. So an action that
 * checks only `error` reports success for a write the database refused: the
 * screen updates, the row does not, and the person finds out on the next
 * refresh.
 *
 * Every update and delete therefore ends in `.select(...)` and passes the rows
 * through here. Zero rows is the refusal.
 *
 * This is also why actions do not re-implement the policy as an `if`: what
 * comes back is what the database actually did, rather than a second opinion
 * that can drift from it.
 */
export function refusedIfEmpty(
  rows: unknown[] | null | undefined,
  message = "You don't have permission to do that.",
): string | null {
  return rows && rows.length > 0 ? null : message;
}
