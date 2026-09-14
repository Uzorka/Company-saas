import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState } from "@/components/states";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import {
  listEmployees,
  listDepartments,
  type EmployeeStatus,
} from "@/lib/employees/queries";
import { EmployeeDirectory } from "./directory";

export const metadata = { title: "Employees" };

/**
 * Staff directory. Source: Phase 4 - Employees, Departments, Attendance.
 *
 * The page checks permission to decide what to *render*; RLS decides what the
 * query *returns*. Both are needed: without the check an HOD would see an
 * empty table rather than the designed permission screen, and without RLS the
 * check would be the only thing standing between a forgotten filter and
 * another department's records.
 */
export default async function EmployeesPage({
  params,
  searchParams,
}: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ q?: string; department?: string; status?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);
  const { q, department, status } = await searchParams;

  // Any of the three scopes is enough to open the page — what each sees
  // differs, and that difference is enforced in the database.
  const mayView =
    can(session, "employees.view_all") ||
    can(session, "employees.view_department") ||
    can(session, "employees.view_self");

  if (!mayView) {
    return (
      <PermissionState
        module="Employees"
        roles={MODULE_ROLES.Employees.map((role) => ROLE_LABELS[role])}
      />
    );
  }

  const [{ rows, error }, { rows: departments }] = await Promise.all([
    listEmployees({
      search: q,
      departmentId: department,
      status: status as EmployeeStatus | undefined,
    }),
    listDepartments(),
  ]);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load the directory"
        body="The request failed. Your data is safe."
      />
    );
  }

  return (
    <EmployeeDirectory
      rows={rows}
      departments={departments}
      orgSlug={org}
      filters={{ q: q ?? "", department: department ?? "", status: status ?? "" }}
    />
  );
}
