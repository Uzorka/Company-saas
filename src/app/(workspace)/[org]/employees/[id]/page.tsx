import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { ErrorState, EmptyState } from "@/components/states";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { StatusPill } from "@/components/ui/status-pill";
import { Button } from "@/components/ui/button";
import {
  getEmployee,
  getCompensation,
  listDepartments,
  listPositions,
} from "@/lib/employees/queries";
import {
  employmentStatusLabel,
  employmentStatusTone,
  employmentTypeLabel,
  formatDate,
} from "@/lib/employees/display";
import { formatMoney } from "@/lib/payroll/model";
import { EditEmployee } from "./edit-employee";

export const metadata = { title: "Employee" };

/**
 * One employee's profile. Source: Phase 0 plan — /[org]/employees/[id].
 *
 * The page does no scoping of its own. RLS decides whether this row exists for
 * this caller, and a row that does not come back is shown as not found rather
 * than as refused — telling someone "you may not view this employee" would
 * confirm the record exists to a person who should not know that.
 *
 * Compensation is the same idea one level down: it lives in its own table with
 * its own policy, so the block below simply renders whatever came back. Nothing
 * here checks a role before showing a salary, because nothing here has to.
 */
export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org, id } = await params;
  const session = await requireOrg(org);

  const { row, error } = await getEmployee(id);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load this profile"
        body="The request failed. Your data is safe."
      />
    );
  }

  if (!row) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink org={org} />
        <EmptyState
          heading="No such employee"
          body="This record does not exist, or it is not part of what your role can see."
        />
      </div>
    );
  }

  const name = `${row.first_name} ${row.last_name}`;

  // Matches `employees_update` exactly, which has no self-edit clause: a
  // person cannot change their own row. Showing Edit to them and having the
  // database refuse it would be a button that does not work.
  //
  // Letting someone correct their own phone number is worth having and is not
  // this change: the policy would need to be column-scoped first, or an
  // employee could move themselves into another department. See docs/BACKLOG.md.
  const mayEdit = can(session, "employees.update");

  const [compensation, { rows: departments }, { rows: positions }] =
    await Promise.all([
      getCompensation(row.id),
      mayEdit ? listDepartments() : Promise.resolve({ rows: [] }),
      mayEdit ? listPositions() : Promise.resolve({ rows: [], error: false }),
    ]);

  return (
    <div className="flex flex-col gap-5">
      <BackLink org={org} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={name} src={row.photo_url} size="lg" />
          <div>
            <h1 className="text-h1">{name}</h1>
            <p className="mt-1 text-body text-text-2">
              {row.position?.title ?? "No position recorded"}
              {row.department ? ` · ${row.department.name}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill tone={employmentStatusTone[row.employment_status]}>
            {employmentStatusLabel[row.employment_status]}
          </StatusPill>
          {mayEdit ? (
            <EditEmployee
              org={org}
              employee={row}
              departments={departments.map((d) => ({ id: d.id, label: d.name }))}
              positions={positions.map((p) => ({
                id: p.id,
                label: p.grade ? `${p.title} · ${p.grade}` : p.title,
              }))}
            />
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <h2 className="text-h3">Employment</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Employee number" mono>
                {row.employee_no}
              </Detail>
              <Detail label="Employment type">
                {employmentTypeLabel[row.employment_type] ?? row.employment_type}
              </Detail>
              <Detail label="Department">{row.department?.name ?? "—"}</Detail>
              <Detail label="Position">{row.position?.title ?? "—"}</Detail>
              <Detail label="Reports to">
                {row.manager
                  ? `${row.manager.first_name} ${row.manager.last_name}`
                  : "—"}
              </Detail>
              <Detail label="Start date" mono>
                {formatDate(row.hire_date)}
              </Detail>
              {row.exit_date ? (
                <Detail label="Exit date" mono>
                  {formatDate(row.exit_date)}
                </Detail>
              ) : null}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-4">
            <h2 className="text-h3">Contact</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Work email">{row.work_email ?? "—"}</Detail>
              <Detail label="Phone">{row.phone ?? "—"}</Detail>
              <Detail label="Location">{row.location ?? "—"}</Detail>
              <Detail label="Sign-in account">
                {row.user_id ? "Linked" : "None yet"}
              </Detail>
            </dl>
            {row.user_id ? null : (
              <p className="border-t border-border pt-4 text-small text-text-3">
                Without an account this person cannot sign in, so their own
                payslips, leave and tasks have nowhere to appear. Employees →
                Create account links one.
              </p>
            )}
          </CardBody>
        </Card>

        {compensation ? (
          <Card>
            <CardBody className="flex flex-col gap-4">
              <h2 className="text-h3">Compensation</h2>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Detail label="Basic salary" mono>
                  {formatMoney(
                    compensation.basic_salary,
                    compensation.currency_code,
                  )}
                </Detail>
                <Detail label="Effective from" mono>
                  {formatDate(compensation.effective_from)}
                </Detail>
              </dl>
              <p className="border-t border-border pt-4 text-small text-text-3">
                Annual basic, before allowances and statutory deductions. A
                payslip is the authority on what was actually paid.
              </p>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function BackLink({ org }: { org: string }) {
  return (
    <Link href={`/${org}/employees`} className="self-start">
      <Button variant="ghost">
        <ArrowLeft aria-hidden />
        All employees
      </Button>
    </Link>
  );
}

function Detail({
  label,
  mono,
  children,
}: {
  label: string;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-overline text-text-3">{label}</dt>
      <dd className={mono ? "mt-1 font-mono text-small" : "mt-1 text-body"}>
        {children}
      </dd>
    </div>
  );
}
