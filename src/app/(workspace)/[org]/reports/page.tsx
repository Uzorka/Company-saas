import { requireOrg, canAny } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, EmptyState } from "@/components/states";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { Card, CardBody } from "@/components/ui/card";
import {
  headcountReport,
  attendanceReport,
  leaveReport,
  payrollReport,
  latestPublishedPeriod,
} from "@/lib/reports/queries";
import { AttendanceChart, TimeSeriesChart, CategoryBarChart } from "./charts";
import { formatMoney } from "@/lib/payroll/model";

export const metadata = { title: "Reports" };

const WINDOW_DAYS = 30;

/**
 * Reports. Source: Phase 9.
 *
 * Every figure here comes from a SECURITY INVOKER function, so the numbers are
 * already scoped to the caller by their own RLS — an HOD sees their department
 * and Management the company, from the same query. Nothing on this page
 * filters by role; it only decides which *sections* to render, and a section
 * a role cannot see would come back empty anyway.
 */
export default async function ReportsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  const mayOpen = canAny(
    session,
    "reports.management",
    "reports.hr",
    "reports.payroll",
    "reports.department",
  );

  if (!mayOpen) {
    return (
      <PermissionState
        module="Reports"
        roles={[
          ROLE_LABELS.management,
          ROLE_LABELS.hr,
          ROLE_LABELS.accounts,
          ROLE_LABELS.hod,
        ]}
      />
    );
  }

  const showPeople = canAny(
    session,
    "reports.management",
    "reports.hr",
    "reports.department",
  );
  const showPayroll = canAny(session, "reports.management", "reports.payroll");

  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - WINDOW_DAYS);
  const fromISO = from.toISOString().slice(0, 10);
  const toISO = today.toISOString().slice(0, 10);
  const year = today.getFullYear();

  const period = showPayroll ? await latestPublishedPeriod() : null;

  const [headcount, attendance, leave, payroll] = await Promise.all([
    showPeople ? headcountReport() : Promise.resolve([]),
    showPeople ? attendanceReport(fromISO, toISO) : Promise.resolve([]),
    showPeople ? leaveReport(year) : Promise.resolve([]),
    period ? payrollReport(period.id) : Promise.resolve([]),
  ]);

  const totalHeadcount = headcount.reduce((sum, r) => sum + Number(r.headcount), 0);
  const totalRecords = attendance.reduce((sum, r) => sum + Number(r.records), 0);
  const totalLate = attendance.reduce((sum, r) => sum + Number(r.late), 0);
  const totalRemote = attendance.reduce((sum, r) => sum + Number(r.remote), 0);
  const pendingLeave = leave.reduce((sum, r) => sum + Number(r.pending), 0);
  const payrollNet = payroll.reduce((sum, r) => sum + Number(r.net), 0);

  const attendanceSeries = attendance.map((row) => ({
    day: new Date(row.work_date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    "At office": Number(row.at_office),
    Remote: Number(row.remote),
  }));

  const lateSeries = attendance.map((row) => ({
    day: new Date(row.work_date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
    }),
    Late: Number(row.late),
  }));

  const headcountSeries = headcount
    .filter((row) => Number(row.headcount) > 0)
    .map((row) => ({
      department: row.department_name,
      People: Number(row.headcount),
    }));

  const nothingYet =
    headcount.length === 0 && attendance.length === 0 && payroll.length === 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-h1">Reports</h1>
        <p className="mt-1 max-w-[70ch] text-body text-text-2">
          The last {WINDOW_DAYS} days, and the current leave year. Figures are
          scoped to what your role can see — a department head sees their own
          department here, not the company.
        </p>
      </div>

      {nothingYet ? (
        <EmptyState
          heading="Nothing to report yet"
          body="Reports are built from attendance, leave and payroll as they happen. Once there are records, they appear here."
        />
      ) : null}

      {showPeople && attendance.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="People" value={totalHeadcount.toLocaleString()} />
          <Stat
            label="Check-ins recorded"
            value={totalRecords.toLocaleString()}
            note={`over ${WINDOW_DAYS} days`}
          />
          <Stat
            label="Late arrivals"
            value={totalLate.toLocaleString()}
            /* The denominator is recorded check-ins, not expected attendance.
               Expected would need shift patterns and the public holiday
               calendar, which the product does not have — so this says what it
               actually measures rather than implying a punctuality rate. */
            note={
              totalRecords > 0
                ? `${Math.round((totalLate / totalRecords) * 100)}% of check-ins`
                : undefined
            }
          />
          <Stat
            label="Remote check-ins"
            value={totalRemote.toLocaleString()}
            note={
              totalRecords > 0
                ? `${Math.round((totalRemote / totalRecords) * 100)}% of check-ins`
                : undefined
            }
          />
        </div>
      ) : null}

      {showPeople && attendanceSeries.length > 0 ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div>
              <h2 className="text-h3">Check-ins by day</h2>
              <p className="mt-1 text-small text-text-2">
                Where people checked in from. Remote check-ins are flagged for
                review; they are not necessarily a problem.
              </p>
            </div>
            <AttendanceChart data={attendanceSeries} />
          </CardBody>
        </Card>
      ) : null}

      {showPeople && lateSeries.some((d) => d.Late > 0) ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div>
              <h2 className="text-h3">Late arrivals by day</h2>
              <p className="mt-1 text-small text-text-2">
                Measured against each employee&rsquo;s shift start, with its
                grace period already applied.
              </p>
            </div>
            <TimeSeriesChart data={lateSeries} dataKey="Late" labelKey="day" />
          </CardBody>
        </Card>
      ) : null}

      {showPeople && headcountSeries.length > 0 ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div>
              <h2 className="text-h3">Headcount by department</h2>
              <p className="mt-1 text-small text-text-2">
                Active staff. People who have left keep their records but are not
                counted.
              </p>
            </div>
            <CategoryBarChart
              data={headcountSeries}
              dataKey="People"
              labelKey="department"
            />
          </CardBody>
        </Card>
      ) : null}

      {showPeople && leave.length > 0 ? (
        <Card>
          <CardBody className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="text-h3">Leave in {year}</h2>
                <p className="mt-1 text-small text-text-2">
                  Days taken counts approved requests only, which is the same
                  rule the balances follow — so the two never disagree.
                </p>
              </div>
              {pendingLeave > 0 ? (
                <p className="text-small text-text-2">
                  <span className="font-mono font-medium text-text" data-numeric>
                    {pendingLeave}
                  </span>{" "}
                  awaiting a decision
                </p>
              ) : null}
            </div>
            {/* Five types across five measures: a table reads better than a
                chart, and every number is exact rather than estimated off an
                axis. */}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-small">
                <thead>
                  <tr className="border-b border-border text-text-2">
                    <th scope="col" className="py-2 pr-3 text-left font-medium">Type</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Requests</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Approved</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Pending</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Declined</th>
                    <th scope="col" className="pl-3 py-2 text-right font-medium">Days taken</th>
                  </tr>
                </thead>
                <tbody>
                  {leave.map((row) => (
                    <tr key={row.leave_type} className="border-b border-border">
                      <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                        {row.leave_type}
                      </th>
                      <Num>{row.requests}</Num>
                      <Num>{row.approved}</Num>
                      <Num>{row.pending}</Num>
                      <Num>{row.declined}</Num>
                      <Num>{Number(row.days_taken)}</Num>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {showPayroll ? (
        period && payroll.length > 0 ? (
          <Card>
            <CardBody className="flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2 className="text-h3">Payroll — {period.label}</h2>
                  <p className="mt-1 text-small text-text-2">
                    The most recent published run. Departments are as they were
                    when the run was costed, not as they are today.
                  </p>
                </div>
                <p className="text-small text-text-2">
                  Net{" "}
                  <span className="font-mono font-medium text-text" data-numeric>
                    {formatMoney(payrollNet, period.currency_code)}
                  </span>
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-small">
                  <thead>
                    <tr className="border-b border-border text-text-2">
                      <th scope="col" className="py-2 pr-3 text-left font-medium">Department</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">People</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Gross</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">PAYE</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Pension</th>
                      <th scope="col" className="pl-3 py-2 text-right font-medium">Net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payroll.map((row) => (
                      <tr key={row.department_name} className="border-b border-border">
                        <th scope="row" className="py-2.5 pr-3 text-left font-normal">
                          {row.department_name}
                        </th>
                        <Num>{row.headcount}</Num>
                        <Money value={row.gross} currency={period.currency_code} />
                        <Money value={row.paye} currency={period.currency_code} />
                        <Money value={row.pension} currency={period.currency_code} />
                        <Money value={row.net} currency={period.currency_code} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        ) : (
          <EmptyState
            heading="No published payroll yet"
            body="Payroll reporting starts once a run is published. Figures from a run still in progress are not shown, because they can still change."
          />
        )
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <Card>
      <CardBody>
        <p className="text-overline uppercase text-text-3">{label}</p>
        <p className="mt-1 font-mono text-h2" data-numeric>
          {value}
        </p>
        {note ? <p className="mt-0.5 text-small text-text-3">{note}</p> : null}
      </CardBody>
    </Card>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return (
    <td className="px-3 py-2.5 text-right font-mono" data-numeric>
      {children}
    </td>
  );
}

function Money({ value, currency }: { value: number; currency: string }) {
  return (
    <td className="px-3 py-2.5 text-right font-mono" data-numeric>
      {formatMoney(value, currency)}
    </td>
  );
}
