import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AuditRow = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_user_id: string | null;
  actor: { full_name: string | null } | null;
};

export type AuditFilters = {
  action?: string;
  entity?: string;
  actor?: string;
  /** ISO date, inclusive. */
  from?: string;
  to?: string;
};

/** How many entries one page shows. The log is append-only and grows forever. */
export const AUDIT_PAGE_SIZE = 50;

/**
 * Read the audit log.
 *
 * Paged by offset rather than streamed: an audit log is read by someone
 * looking for a specific thing on a specific day, and filters plus a page of
 * fifty answer that better than an infinite scroll nobody reaches the end of.
 *
 * Ordered newest first, and by id as a tiebreak — two entries written in the
 * same millisecond would otherwise come back in an arbitrary order, and the
 * one thing an audit reader must be able to trust is sequence.
 */
export async function listAudit(
  filters: AuditFilters,
  page = 0,
): Promise<{ rows: AuditRow[]; total: number; error: boolean }> {
  const supabase = await createClient();

  let query = supabase
    .from("audit_logs")
    .select(
      "id, action, entity_type, entity_id, metadata, created_at, actor_user_id",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(page * AUDIT_PAGE_SIZE, page * AUDIT_PAGE_SIZE + AUDIT_PAGE_SIZE - 1);

  // Prefix match, so "payroll" finds payroll.calculate, payroll.approved and
  // the rest without the reader having to know the exact verb.
  if (filters.action) query = query.ilike("action", `${filters.action}%`);
  if (filters.entity) query = query.eq("entity_type", filters.entity);
  if (filters.actor) query = query.eq("actor_user_id", filters.actor);
  if (filters.from) query = query.gte("created_at", filters.from);
  // `to` is a date; the whole of that day should be included.
  if (filters.to) query = query.lt("created_at", `${filters.to}T23:59:59.999Z`);

  const { data, count, error } = await query;

  if (error) {
    // Swallowing this is what made the screen say "the request failed" and
    // nothing else for as long as the embed above was broken. The reader still
    // gets a safe message; the server log gets something to act on.
    console.error("audit: listAudit failed", error.message, error.code);
    return { rows: [], total: 0, error: true };
  }

  const rows = (data ?? []) as unknown as AuditRow[];

  // Actor names come from a second query, not an embed.
  //
  // `audit_logs.actor_user_id` references `auth.users`, and `profiles` is a
  // separate table that also references `auth.users` — there is no foreign key
  // between the two for PostgREST to follow, so `actor:profiles(full_name)`
  // is not a join it can resolve. It failed the whole request, which is why
  // the screen showed an error rather than a missing name.
  const actorIds = [
    ...new Set(
      rows
        .map((r) => r.actor_user_id)
        .filter((id): id is string => typeof id === "string"),
    ),
  ];

  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);

    const names = new Map(
      (profiles ?? []).map((p) => [p.id as string, p.full_name as string | null]),
    );

    for (const row of rows) {
      row.actor = row.actor_user_id
        ? { full_name: names.get(row.actor_user_id) ?? null }
        : null;
    }
  } else {
    for (const row of rows) row.actor = null;
  }

  return { rows, total: count ?? 0, error: false };
}

/**
 * The distinct actions and entity types present, for the filter dropdowns.
 *
 * Read from the log itself rather than hard-coded: the set of actions grows
 * whenever a new audited operation is added, and a filter list that has to be
 * updated by hand is a filter list that goes stale.
 */
export async function auditFacets(): Promise<{
  actions: string[];
  entities: string[];
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_logs")
    .select("action, entity_type")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) console.error("audit: auditFacets failed", error.message, error.code);

  const rows = (data ?? []) as { action: string; entity_type: string }[];

  // The module prefix — "payroll" from "payroll.approved" — because filtering
  // by module is what people actually want.
  const actions = [...new Set(rows.map((r) => r.action.split(".")[0]))].sort();
  const entities = [...new Set(rows.map((r) => r.entity_type))].sort();

  return { actions, entities };
}
