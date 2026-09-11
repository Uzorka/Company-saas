/**
 * Build the PostgREST `or` filter for a directory search.
 *
 * Commas and parentheses are PostgREST's own delimiters inside an `or(...)`
 * group. A name like "O'Brien, A" or a paste containing brackets would
 * otherwise be read as filter syntax rather than as text to match — producing
 * either an error or, worse, a filter nobody intended.
 *
 * Returns null when nothing searchable remains, so the caller can skip the
 * filter entirely rather than sending an empty one.
 */
export function buildEmployeeSearchFilter(raw: string): string | null {
  // Strip the delimiters, then collapse the whitespace they leave behind:
  // "Okonkwo, Adaeze" would otherwise become a pattern with a double space,
  // which matches nothing under ILIKE.
  const term = raw.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
  if (!term) return null;

  return [
    `first_name.ilike.%${term}%`,
    `last_name.ilike.%${term}%`,
    `employee_no.ilike.%${term}%`,
    `work_email.ilike.%${term}%`,
  ].join(",");
}
