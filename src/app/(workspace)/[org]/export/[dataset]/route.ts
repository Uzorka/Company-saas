import { requireOrg, can } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { DATASETS } from "@/lib/export/datasets";
import { toCsv, safeFilename, UTF8_BOM } from "@/lib/export/csv";

/**
 * Export a section as CSV.
 *
 * A route handler rather than a server action, because the browser must
 * receive a file: a server action returns a value to React, and turning that
 * into a download means building a blob in the client and holding the whole
 * export in memory on the way.
 *
 * WHAT MAKES THIS SAFE
 *
 * The dataset is looked up in a fixed registry, never constructed from the
 * URL — so `/export/../../something` and `/export/employees;drop` resolve to
 * nothing rather than to a query. The rows come back through the caller's own
 * client, so RLS decides them exactly as it does on screen. There is no admin
 * client here and there must never be one: an export that widened access would
 * be the worst bug this product could ship.
 *
 * And every export is recorded. A CSV of everyone's pay leaves on a laptop;
 * "who took a copy, and when" is precisely what an audit log is for.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ org: string; dataset: string }> },
) {
  const { org, dataset: name } = await params;

  const dataset = Object.hasOwn(DATASETS, name) ? DATASETS[name] : undefined;
  if (!dataset) {
    return new Response("No such export.", { status: 404 });
  }

  const session = await requireOrg(org);

  if (!can(session, dataset.permission)) {
    // The same answer the screen gives. No detail about what exists.
    return new Response("You don't have permission to export this.", {
      status: 403,
    });
  }

  let rows;
  try {
    rows = await dataset.fetch();
  } catch {
    return new Response("That export could not be built.", { status: 500 });
  }

  const columns = dataset.columns as {
    header: string;
    value: (row: unknown) => unknown;
  }[];
  const body = UTF8_BOM + toCsv(rows, columns);

  const supabase = await createClient();
  await supabase.rpc("write_audit", {
    p_action: "export.csv",
    p_entity_type: name,
    p_entity_id: null,
    p_metadata: { rows: rows.length, label: dataset.label },
  });

  const filename = safeFilename([
    org,
    dataset.label,
    new Date().toISOString().slice(0, 10),
  ]);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // An export is a snapshot of personal data. It should not sit in a
      // shared cache, and it should not be revalidated behind the person's
      // back once their permissions change.
      "Cache-Control": "no-store, private",
    },
  });
}
