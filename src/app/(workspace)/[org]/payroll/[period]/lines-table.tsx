"use client";

import { DataTable, type Column } from "@/components/ui/data-table";
import { formatMoney } from "@/lib/payroll/model";
import type { RunLineRow } from "@/lib/payroll/queries";

/**
 * The lines of one payroll run.
 *
 * This exists as its own client component for a reason that is not stylistic.
 * `DataTable` is a client component and its columns carry `cell` render
 * functions. A function cannot cross the server/client boundary — React has
 * nothing to serialise it into — so building the column list in the page,
 * which is a Server Component, threw at request time with "A server error
 * occurred" and no further explanation.
 *
 * It built, typechecked and linted, because none of those render the page. It
 * is also the only place in the app that did this: every other DataTable sits
 * inside a component that is already "use client".
 *
 * The rule the fix follows: the columns are defined where the table lives.
 */
export function PayrollLinesTable({
  lines,
  currency,
  caption,
}: {
  lines: RunLineRow[];
  currency: string;
  caption: string;
}) {
  const money = (value: string) => (
    <span className="font-mono" data-numeric>
      {formatMoney(value, currency)}
    </span>
  );

  const columns: Column<RunLineRow>[] = [
    {
      key: "employee",
      header: "Employee",
      primary: true,
      cell: (row) => (
        <span className="min-w-0">
          <span className="block truncate font-medium">{row.employee_name}</span>
          <span className="block font-mono text-[11px] text-text-3">
            {row.employee_no}
          </span>
        </span>
      ),
    },
    {
      key: "dept",
      header: "Department",
      cell: (row) => row.department_name ?? "—",
    },
    {
      key: "gross",
      header: "Gross",
      align: "right",
      essential: true,
      cell: (row) => money(row.gross_pay),
    },
    { key: "paye", header: "PAYE", align: "right", cell: (row) => money(row.paye) },
    {
      key: "pension",
      header: "Pension",
      align: "right",
      cell: (row) => money(row.pension_employee),
    },
    { key: "nhf", header: "NHF", align: "right", cell: (row) => money(row.nhf) },
    {
      key: "net",
      header: "Net",
      align: "right",
      essential: true,
      cell: (row) => (
        <span className="font-mono font-medium" data-numeric>
          {formatMoney(row.net_pay, currency)}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      rows={lines}
      columns={columns}
      getRowKey={(row) => row.id}
      caption={caption}
      density="compact"
    />
  );
}
