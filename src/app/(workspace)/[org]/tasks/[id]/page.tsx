import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireOrg, can } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { ErrorState, EmptyState } from "@/components/states";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-pill";
import { getTask, getTaskThread } from "@/lib/tasks/queries";
import {
  statusLabel,
  statusTone,
  priorityLabel,
  priorityTone,
  verificationMode,
  visitStateLabel,
  visitStateTone,
  isOverdue,
} from "@/lib/tasks/model";
import { formatDate } from "@/lib/employees/display";
import { TaskThread } from "./thread";

export const metadata = { title: "Task" };

/**
 * One task. Source: Phase 5 — tasks and field visits.
 *
 * The board shows a card; this shows the record. The difference that matters
 * is the conversation: `task_comments` and `task_activity` have existed since
 * migration 0016 and nothing in the product read or wrote either, which left
 * `tasks.comment` granted to every role and usable by none.
 *
 * Visibility is `can_see_task()`. A task that does not come back is shown as
 * not found, not as refused.
 */
export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ org: string; id: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org, id } = await params;
  const session = await requireOrg(org);

  const { row, error } = await getTask(id);

  if (error) {
    return (
      <ErrorState
        heading="Couldn't load this task"
        body="The request failed. Your data is safe."
      />
    );
  }

  if (!row) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink org={org} />
        <EmptyState
          heading="No such task"
          body="This task does not exist, or it is not part of what your role can see."
        />
      </div>
    );
  }

  const { comments, activity } = await getTaskThread(row.id);
  const proof = verificationMode[row.verification_mode];
  const overdue = isOverdue(row.due_date, row.status);

  return (
    <div className="flex flex-col gap-5">
      <BackLink org={org} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-overline uppercase text-text-3">
            {row.reference}
          </p>
          <h1 className="mt-1 text-h1">{row.title}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={priorityTone[row.priority]}>
            {priorityLabel[row.priority]}
          </StatusPill>
          <StatusPill tone={statusTone[row.status]}>
            {statusLabel[row.status]}
          </StatusPill>
          {overdue ? <StatusPill tone="danger">Overdue</StatusPill> : null}
        </div>
      </div>

      {row.description ? (
        <Card>
          <CardBody>
            <p className="max-w-[80ch] whitespace-pre-wrap text-body text-text-2">
              {row.description}
            </p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardBody className="flex flex-col gap-4">
            <h2 className="text-h3">Details</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Detail label="Department">{row.department?.name ?? "—"}</Detail>
              <Detail label="Raised by">{row.createdByName}</Detail>
              <Detail label="Start date" mono>
                {row.start_date ? formatDate(row.start_date) : "—"}
              </Detail>
              <Detail label="Due date" mono>
                {row.due_date ? formatDate(row.due_date) : "—"}
              </Detail>
              {row.completed_at ? (
                <Detail label="Completed" mono>
                  {formatDate(row.completed_at)}
                </Detail>
              ) : null}
            </dl>

            <div className="border-t border-border pt-4">
              <p className="text-overline text-text-3">Proof required</p>
              <p className="mt-1 text-body">{proof.label}</p>
              <p className="mt-1 text-small text-text-2">{proof.description}</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="flex flex-col gap-4">
            <h2 className="text-h3">
              {row.assignees.length === 1 ? "Assignee" : "Assignees"}
            </h2>
            {row.assignees.length === 0 ? (
              <p className="text-small text-text-2">
                Nobody is assigned yet. Work often gets created before it gets
                handed out, so this is allowed.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {row.assignees.map((a) => (
                  <li key={a.employee.id} className="text-body">
                    {a.employee.first_name} {a.employee.last_name}
                  </li>
                ))}
              </ul>
            )}

            {row.target ? (
              <div className="border-t border-border pt-4">
                <p className="text-overline text-text-3">Target location</p>
                <p className="mt-1 text-body">{row.target.name}</p>
                {row.target.address ? (
                  <p className="text-small text-text-2">{row.target.address}</p>
                ) : null}
                <p className="mt-1 text-small text-text-3">
                  Capture is blocked beyond {row.target.allowed_radius_m}m — the
                  range is checked before the camera opens, so a submitted visit
                  was in range or explicitly flagged.
                </p>
              </div>
            ) : null}

            {row.visits.length > 0 ? (
              <div className="border-t border-border pt-4">
                <p className="text-overline text-text-3">Field visits</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {row.visits.map((v) => (
                    <li key={v.id}>
                      <StatusPill tone={visitStateTone[v.state]}>
                        {visitStateLabel[v.state]}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody>
          <TaskThread
            org={org}
            taskId={row.id}
            comments={comments}
            activity={activity}
            canComment={can(session, "tasks.comment")}
          />
        </CardBody>
      </Card>
    </div>
  );
}

function BackLink({ org }: { org: string }) {
  return (
    <Link href={`/${org}/tasks`} className="self-start">
      <Button variant="ghost">
        <ArrowLeft aria-hidden />
        All tasks
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
