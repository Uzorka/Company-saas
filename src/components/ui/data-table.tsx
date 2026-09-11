"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * Table. Source: Developer Handoff section 06 and section 08.
 *
 * The non-negotiable: under 640px this becomes cards. Horizontally scrolling a
 * table on a phone is called out in the design as an unacceptable
 * implementation, so the card layout is not a fallback — it is the mobile
 * design, rendered from the same column definitions.
 *
 * Between 640 and 1023px a real table appears but drops to the columns marked
 * `essential`. Columns are removed, never squeezed.
 */
export type Column<Row> = {
  key: string;
  header: string;
  /** Kept at tablet width. Everything else is dropped there, not narrowed. */
  essential?: boolean;
  align?: "left" | "right";
  /** Rendered in the card layout as the heading line. Exactly one column. */
  primary?: boolean;
  cell: (row: Row) => React.ReactNode;
};

export function DataTable<Row>({
  rows,
  columns,
  getRowKey,
  onRowClick,
  caption,
  empty,
  density = "comfortable",
}: {
  rows: Row[];
  columns: Column<Row>[];
  getRowKey: (row: Row) => string;
  onRowClick?: (row: Row) => void;
  caption: string;
  empty?: React.ReactNode;
  density?: "comfortable" | "compact";
}) {
  const captionId = useId();

  if (rows.length === 0 && empty) return <>{empty}</>;

  const primary = columns.find((column) => column.primary) ?? columns[0];
  const secondary = columns.filter((column) => column !== primary);
  const rowHeight = density === "compact" ? "h-9" : "h-11";

  return (
    <>
      {/* Phone: one record per card, status as a pill, metadata on its own line. */}
      <ul className="flex flex-col gap-2 sm:hidden" aria-label={caption}>
        {rows.map((row) => {
          const content = (
            <>
              <div className="text-body font-medium text-text">
                {primary.cell(row)}
              </div>
              <dl className="mt-2 flex flex-col gap-1">
                {secondary.map((column) => (
                  <div key={column.key} className="flex gap-2 text-small">
                    <dt className="min-w-[92px] shrink-0 text-text-3">
                      {column.header}
                    </dt>
                    <dd className="min-w-0 flex-1 text-text-2">
                      {column.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          );

          return (
            <li key={getRowKey(row)}>
              {onRowClick ? (
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  className="w-full rounded-xl border border-border bg-bg p-4 text-left shadow-e1"
                >
                  {content}
                </button>
              ) : (
                <div className="rounded-xl border border-border bg-bg p-4 shadow-e1">
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Tablet and up: a real table. */}
      <div className="hidden overflow-hidden rounded-xl border border-border bg-bg sm:block">
        <table className="w-full border-collapse" aria-describedby={captionId}>
          <caption id={captionId} className="sr-only">
            {caption}
          </caption>
          <thead>
            <tr className="border-b border-border bg-surface">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "px-4 py-3 text-small font-semibold text-text-2",
                    column.align === "right" ? "text-right" : "text-left",
                    // Dropped at tablet width — removed, not squeezed.
                    !column.essential && !column.primary && "hidden lg:table-cell",
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === "Enter") onRowClick(row);
                      }
                    : undefined
                }
                className={cn(
                  rowHeight,
                  "border-b border-border last:border-0",
                  onRowClick &&
                    "cursor-pointer transition-colors duration-(--duration-instant) hover:bg-surface focus-visible:bg-surface",
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-4 py-2 text-body text-text-2",
                      column.align === "right" && "text-right",
                      !column.essential &&
                        !column.primary &&
                        "hidden lg:table-cell",
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
