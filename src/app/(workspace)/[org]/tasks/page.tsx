import Link from "next/link";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { PermissionState, ErrorState } from "@/components/states";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/auth/permissions";
import { listTasks } from "@/lib/tasks/queries";
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

  const { rows, error } = await listTasks();

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
      {can(session, "tasks.verify_visit") ? (
        <div className="flex justify-end">
          <Link
            href={`/${org}/tasks/visits`}
            className={buttonVariants({ variant: "secondary" })}
          >
            Visit review queue
          </Link>
        </div>
      ) : null}
      <TaskBoard rows={rows} />
    </div>
  );
}
