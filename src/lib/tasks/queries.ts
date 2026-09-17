import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  TaskPriority,
  TaskStatus,
  VerificationMode,
  VisitState,
} from "./model";

/**
 * Task reads.
 *
 * As with employees, none of these filter by scope — RLS decides what comes
 * back. An assignee running the same query as their HOD gets their own tasks
 * and nothing else, with no `where` clause here to forget.
 */
export type TaskRow = {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  verification_mode: VerificationMode;
  due_date: string | null;
  department: { id: string; name: string } | null;
  assignees: { employee: { id: string; first_name: string; last_name: string } }[];
  target: { name: string; address: string | null; allowed_radius_m: number } | null;
  visits: { id: string; state: VisitState }[];
};

const TASK_SELECT = `
  id, reference, title, description, status, priority, verification_mode, due_date,
  department:departments(id, name),
  assignees:task_assignees(employee:employees(id, first_name, last_name)),
  target:task_target_locations(name, address, allowed_radius_m),
  visits:field_visits(id, state)
`;

export async function listTasks(): Promise<{
  rows: TaskRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(200);

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as TaskRow[], error: null };
}

export type ReviewVisitRow = {
  id: string;
  state: VisitState;
  submitted_at: string | null;
  distance_m: number | null;
  accuracy_m: number | null;
  report: string | null;
  exception_codes: string[];
  review_reason: string | null;
  task: {
    id: string;
    reference: string;
    title: string;
    target: { name: string; allowed_radius_m: number }[] | null;
  } | null;
  employee: { first_name: string; last_name: string } | null;
};

/**
 * The review queue. Submitted and flagged only — a verified or returned visit
 * has already had its decision, and leaving them here would make the queue
 * look permanently full.
 */
export async function listVisitsAwaitingReview(): Promise<{
  rows: ReviewVisitRow[];
  error: string | null;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("field_visits")
    .select(
      `id, state, submitted_at, distance_m, accuracy_m, report, exception_codes,
       review_reason,
       task:tasks(id, reference, title, target:task_target_locations(name, allowed_radius_m)),
       employee:employees(first_name, last_name)`,
    )
    .in("state", ["submitted", "flagged"])
    .order("submitted_at", { ascending: true });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as unknown as ReviewVisitRow[], error: null };
}

// ---------------------------------------------------------------------------
// One task
// ---------------------------------------------------------------------------

export type TaskComment = {
  id: string;
  body: string;
  created_at: string;
  author_id: string;
  authorName: string;
};

export type TaskActivityRow = {
  id: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
  actorName: string | null;
};

export type TaskDetail = TaskRow & {
  start_date: string | null;
  completed_at: string | null;
  created_at: string;
  created_by: string;
  createdByName: string;
};

const TASK_DETAIL_SELECT = `
  id, reference, title, description, status, priority, verification_mode,
  start_date, due_date, completed_at, created_at, created_by,
  department:departments(id, name),
  assignees:task_assignees(employee:employees(id, first_name, last_name)),
  target:task_target_locations(name, address, allowed_radius_m),
  visits:field_visits(id, state)
`;

/**
 * One task, or null.
 *
 * `can_see_task()` decides. As with the employee profile, a task that does not
 * come back is shown as not found rather than as refused — "you may not see
 * this task" would confirm it exists.
 */
export async function getTask(
  id: string,
): Promise<{ row: TaskDetail | null; error: boolean }> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("tasks: getTask failed", error.message, error.code);
    return { row: null, error: true };
  }
  if (!data) return { row: null, error: false };

  const row = data as unknown as TaskDetail;
  const names = await resolveNames(supabase, [row.created_by]);
  row.createdByName = names.get(row.created_by) ?? "Unknown";

  return { row, error: false };
}

/**
 * Comments and activity, oldest first — it is a conversation, so it reads
 * downwards.
 *
 * Author names come from `profiles` in a second query: the foreign key points
 * at `auth.users`, so there is no relationship for PostgREST to embed across.
 */
export async function getTaskThread(taskId: string): Promise<{
  comments: TaskComment[];
  activity: TaskActivityRow[];
}> {
  const supabase = await createClient();

  const [{ data: comments }, { data: activity }] = await Promise.all([
    supabase
      .from("task_comments")
      .select("id, body, created_at, author_id")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true }),
    supabase
      .from("task_activity")
      .select("id, action, detail, created_at, actor_id")
      .eq("task_id", taskId)
      .order("created_at", { ascending: true }),
  ]);

  const ids = [
    ...new Set([
      ...(comments ?? []).map((c) => c.author_id as string),
      ...(activity ?? [])
        .map((a) => a.actor_id as string | null)
        .filter((v): v is string => typeof v === "string"),
    ]),
  ];

  const names = await resolveNames(supabase, ids);

  return {
    comments: (comments ?? []).map((c) => ({
      id: c.id as string,
      body: c.body as string,
      created_at: c.created_at as string,
      author_id: c.author_id as string,
      authorName: names.get(c.author_id as string) ?? "Unknown",
    })),
    activity: (activity ?? []).map((a) => ({
      id: a.id as string,
      action: a.action as string,
      detail: (a.detail ?? {}) as Record<string, unknown>,
      created_at: a.created_at as string,
      actorName: a.actor_id ? (names.get(a.actor_id as string) ?? "Unknown") : null,
    })),
  };
}

async function resolveNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  for (const p of data ?? []) names.set(p.id as string, p.full_name as string);
  return names;
}
