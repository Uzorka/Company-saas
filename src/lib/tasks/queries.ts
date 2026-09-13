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
