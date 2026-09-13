import Link from "next/link";
import { notFound } from "next/navigation";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState } from "@/components/states";
import { getPeriodWithLines, sumLines } from "@/lib/payroll/queries";
import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Timeline } from "@/components/ui/timeline";
import {
  formatMoney,
  formatMoneyCompact,
  PAYROLL_STATUSES,
  payrollStatusLabel,
  payrollStatusMeaning,
  payrollStatusTone,
} from "@/lib/payroll/model";
import { formatDate } from "@/lib/employees/display";
import type { RunLineRow } from "@/lib/payroll/queries";
import { PipelineActions } from "./actions-panel";

export const metadata = { title: "Payroll run" };

export default async function PayrollRunPage({
  params,
}: {
  params: Promise<{ org: string; period: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org, period: periodId } = await params;
  const session = await requireOrg(org);

  if (!can(session, "payroll.view_all")) {
    return <PermissionState module="Payroll" roles={["Accounts", "Management"]} />;
  }

  const { period, lines, error } = await getPeriodWithLines(periodId);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load this run"
        body="The request failed. Your data is safe."
      />
    );
  }
  if (!period) notFound();

  const totals = sumLines(lines);
  const currency = period.currency_code;

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
    { key: "dept", header: "Department", cell: (row) => row.department_name ?? "—" },
    {
      key: "gross",
      header: "Gross",
      align: "right",
      essential: true,
      cell: (row) => <Money value={row.gross_pay} currency={currency} />,
    },
    { key: "paye", header: "PAYE", align: "right", cell: (row) => <Money value={row.paye} currency={currency} /> },
    { key: "pension", header: "Pension", align: "right", cell: (row) => <Money value={row.pension_employee} currency={currency} /> },
    { key: "nhf", header: "NHF", align: "right", cell: (row) => <Money value={row.nhf} currency={currency} /> },
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

  // The pipeline, rendered from the status rather than tracked separately.
  const currentIndex = PAYROLL_STATUSES.indexOf(period.status);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link
          href={`/${org}/payroll`}
          className="text-small text-brand-600 hover:underline"
        >
          ← All periods
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-h1">{period.label}</h1>
            <p className="mt-1 font-mono text-small text-text-2">
              {formatDate(period.starts_on)} → {formatDate(period.ends_on)}
              {period.pay_date ? ` · pays ${formatDate(period.pay_date)}` : ""}
            </p>
          </div>
          <StatusPill tone={payrollStatusTone[period.status]}>
            {payrollStatusLabel[period.status]}
          </StatusPill>
        </div>
        <p className="mt-2 max-w-[68ch] text-body text-text-2">
          {payrollStatusMeaning[period.status]}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Gross" value={formatMoneyCompact(totals.gross, currency)} />
        <Stat label="Deductions" value={formatMoneyCompact(totals.deductions, currency)} />
        <Stat label="Net payable" value={formatMoneyCompact(totals.net, currency)} />
        <Stat label="Employees" value={String(totals.count)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <Card>
          <CardBody>
            <h2 className="text-h3">Pipeline</h2>
            <div className="mt-3">
              <Timeline
                nodes={PAYROLL_STATUSES.map((status, index) => ({
                  label: payrollStatusLabel[status],
                  state:
                    index < currentIndex
                      ? "done"
                      : index === currentIndex
                        ? "active"
                        : "todo",
                }))}
              />
            </div>
          </CardBody>
        </Card>

        <div className="flex flex-col gap-4">
          <PipelineActions
            periodId={period.id}
            status={period.status}
            employeeCount={totals.count}
            netTotal={formatMoney(totals.net, currency)}
            canProcess={can(session, "payroll.process")}
            canApprove={can(session, "payroll.approve")}
            canPublish={can(session, "payroll.publish")}
            submittedByMe={period.submitted_by === session.userId}
          />

          {lines.length > 0 ? (
            <DataTable
              rows={lines}
              columns={columns}
              getRowKey={(row) => row.id}
              caption={`Payroll lines for ${period.label}`}
              density="compact"
            />
          ) : (
            <Card>
              <CardBody className="text-body text-text-2">
                No lines yet. Calculating the run generates one for every
                active employee from their effective compensation.
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Money({ value, currency }: { value: string; currency: string }) {
  return (
    <span className="font-mono" data-numeric>
      {formatMoney(value, currency)}
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody className="p-4 sm:p-4">
        <p className="text-small text-text-3">{label}</p>
        <p className="mt-1 font-mono text-h2" data-numeric>
          {value}
        </p>
      </CardBody>
    </Card>
  );
}
