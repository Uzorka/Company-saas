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
      "id, action, entity_type, entity_id, metadata, created_at, actor_user_id, actor:profiles(full_name)",
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

  if (error) return { rows: [], total: 0, error: true };
  return {
    rows: (data ?? []) as unknown as AuditRow[],
    total: count ?? 0,
    error: false,
  };
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
  const { data } = await supabase
    .from("audit_logs")
    .select("action, entity_type")
    .order("created_at", { ascending: false })
    .limit(1000);

  const rows = (data ?? []) as { action: string; entity_type: string }[];

  // The module prefix — "payroll" from "payroll.approved" — because filtering
  // by module is what people actually want.
  const actions = [...new Set(rows.map((r) => r.action.split(".")[0]))].sort();
  const entities = [...new Set(rows.map((r) => r.entity_type))].sort();

  return { actions, entities };
}
