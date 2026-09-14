import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState, EmptyState } from "@/components/states";
import { listMyPayslips, myEmployeeId } from "@/lib/payroll/queries";
import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { formatMoney } from "@/lib/payroll/model";
import { formatDate } from "@/lib/employees/display";

export const metadata = { title: "Payslips" };

/**
 * Payslips. Source: Phase 6 — "A document, not a screen."
 *
 * Read-only always, and print-friendly: the design notes these get used as
 * proof of income by banks and landlords, so the print layout matters as much
 * as the screen one.
 */
export default async function PayslipsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  if (!can(session, "payroll.view_self") && !can(session, "payroll.view_all")) {
    return <PermissionState module="Payslips" roles={["Accounts", "Management"]} />;
  }

  const employeeId = await myEmployeeId(session.userId);
  const { rows, error } = await listMyPayslips(employeeId);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load your payslips"
        body="The request failed. Your data is safe."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="print:hidden">
        <h1 className="text-h1">Payslips</h1>
        <p className="mt-1 text-body text-text-2">
          Your published payslips. These never change once issued.
        </p>
      </div>

      {rows.length === 0 ? (
        employeeId === null ? (
          // Distinct from "no payslips yet": this account is not a person on
          // the payroll, so there is nothing of its own to show and never will
          // be. Saying "none yet" would suggest waiting fixes it.
          <EmptyState
            heading="This account has no employee record"
            body="Payslips on this screen are your own. Your sign-in is not attached to a staff record, so there are none to show. Everyone else's figures live on the payroll run itself."
            action={
              can(session, "payroll.view_all") ? (
                <Link
                  href={`/${org}/payroll`}
                  className="text-brand-600 underline underline-offset-2"
                >
                  Go to payroll
                </Link>
              ) : undefined
            }
          />
        ) : (
          <EmptyState
            heading="No payslips yet"
            body="Payslips appear here once a payroll run is published. Nothing is visible before then, even while a run is being prepared."
          />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((slip) => (
            <li key={slip.id}>
              <Card>
                <CardBody className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-h3">{slip.line?.employee_name}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-text-3">
                        {slip.line?.employee_no}
                        {slip.line?.department_name ? ` · ${slip.line.department_name}` : ""}
                        {" · published "}
                        {formatDate(slip.published_at)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-overline uppercase text-text-3">Net pay</p>
                      <p className="font-mono text-h2" data-numeric>
                        {formatMoney(slip.line?.net_pay, slip.line?.currency_code)}
                      </p>
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-3">
                    <Figure label="Basic" value={slip.line?.basic_salary} currency={slip.line?.currency_code} />
                    <Figure label="Gross" value={slip.line?.gross_pay} currency={slip.line?.currency_code} />
                    <Figure label="PAYE" value={slip.line?.paye} currency={slip.line?.currency_code} />
                    <Figure label="Pension" value={slip.line?.pension_employee} currency={slip.line?.currency_code} />
                    <Figure label="NHF" value={slip.line?.nhf} currency={slip.line?.currency_code} />
                    <Figure label="Total deductions" value={slip.line?.total_deductions} currency={slip.line?.currency_code} />
                  </dl>

                  <p className="border-t border-border pt-3 text-small text-text-3 print:hidden">
                    Use your browser&rsquo;s print option to save this as a PDF.
                    The print layout is greyscale-safe and fits one A4 page.
                  </p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  currency,
}: {
  label: string;
  value: string | null | undefined;
  currency: string | undefined;
}) {
  return (
    <div>
      <dt className="text-overline uppercase text-text-3">{label}</dt>
      <dd className="mt-0.5 font-mono text-body" data-numeric>
        {formatMoney(value, currency)}
      </dd>
    </div>
  );
}
