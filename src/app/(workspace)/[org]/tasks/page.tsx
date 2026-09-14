import Link from "next/link";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState } from "@/components/states";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import { listTasks } from "@/lib/tasks/queries";
import { listDepartments, listEmployees } from "@/lib/employees/queries";
import { CreateTask } from "./create-task";
import { buttonVariants } from "@/components/ui/button";
import { TaskBoard } from "./board";

export const metadata = { title: "Tasks" };

export default async function TasksPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org } = await params;
  const session = await requireOrg(org);

  const mayView =
    can(session, "tasks.view_all") ||
    can(session, "tasks.view_department") ||
    can(session, "tasks.view_assigned");

  if (!mayView) {
    return (
      <PermissionState
        module="Tasks"
        roles={MODULE_ROLES.Tasks.map((role) => ROLE_LABELS[role])}
      />
    );
  }

  const mayCreate = can(session, "tasks.create");

  // Departments and staff only feed the create form's pickers. RLS scopes both
  // to what this caller may see, so an HOD's list is their department's.
  const [{ rows, error }, { rows: departments }, { rows: staff }] =
    await Promise.all([
      listTasks(),
      mayCreate ? listDepartments() : Promise.resolve({ rows: [], error: false }),
      mayCreate ? listEmployees({}) : Promise.resolve({ rows: [], error: false }),
    ]);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load tasks"
        body="The request failed. Your data is safe."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {can(session, "tasks.verify_visit") || mayCreate ? (
        <div className="flex flex-wrap justify-end gap-2.5">
          {can(session, "tasks.verify_visit") ? (
            <Link
              href={`/${org}/tasks/visits`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Visit review queue
            </Link>
          ) : null}
          {mayCreate ? (
            <CreateTask
              org={org}
              departments={departments.map((d) => ({ id: d.id, label: d.name }))}
              employees={staff.map((person) => ({
                id: person.id,
                label: `${person.first_name} ${person.last_name}`,
              }))}
            />
          ) : null}
        </div>
      ) : null}
      <TaskBoard rows={rows} />
    </div>
  );
}
