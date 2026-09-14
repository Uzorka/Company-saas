import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState, EmptyState } from "@/components/states";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import { Card, CardBody } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { listDepartments, departmentHeadcounts } from "@/lib/employees/queries";
import Link from "next/link";
import { CreateDepartment, CreatePosition } from "./create-department";

export const metadata = { title: "Departments" };

/**
 * Departments. Source: Phase 4 - Employees, Departments, Attendance.
 *
 * An HOD reaching this page sees only the departments they head — not because
 * this component filters, but because the policy does. The same query returns
 * different rows for different callers, which is the point of putting the
 * scope in the database rather than in a `where` clause someone can forget.
 */
export default async function DepartmentsPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  if (!can(session, "departments.view")) {
    return (
      <PermissionState
        module="Departments"
        roles={MODULE_ROLES.Departments.map((role) => ROLE_LABELS[role])}
      />
    );
  }

  const [{ rows, error }, headcounts] = await Promise.all([
    listDepartments(),
    departmentHeadcounts(),
  ]);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load departments"
        body="The request failed. Your data is safe."
      />
    );
  }

  const canManage = can(session, "departments.manage");
  const options = rows.map((row) => ({ id: row.id, label: row.name }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-h1">Departments</h1>
          <p className="mt-1 text-body text-text-2">
            {rows.length} {rows.length === 1 ? "department" : "departments"}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-2.5">
            <CreatePosition org={org} departments={options} />
            <CreateDepartment org={org} departments={options} />
          </div>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          heading="No departments yet"
          body="Departments group people, scope what a head of department can see, and organise tasks and leave approvals. HR can add the first one in Settings."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((department) => {
            const headcount = headcounts[department.id] ?? 0;
            return (
              <li key={department.id}>
                <Card interactive className="h-full">
                  <CardBody className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link
                          href={`/${org}/employees?department=${department.id}`}
                          className="text-h3 hover:underline"
                        >
                          {department.name}
                        </Link>
                        <p className="mt-0.5 font-mono text-[11px] text-text-3">
                          {department.code}
                        </p>
                      </div>
                      {department.active ? null : (
                        <StatusPill tone="mute">Inactive</StatusPill>
                      )}
                    </div>

                    {department.description ? (
                      <p className="text-small text-text-2">
                        {department.description}
                      </p>
                    ) : null}

                    <div className="mt-auto border-t border-border pt-3">
                      <p className="text-overline uppercase text-text-3">
                        Headcount
                      </p>
                      <p
                        className="mt-0.5 text-h2 font-mono"
                        data-numeric
                      >
                        {headcount}
                      </p>
                    </div>
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-small text-text-3">
        Department heads, positions and per-department attendance land with the
        department detail screen.
      </p>
    </div>
  );
}
