import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Reads that support account provisioning.
 *
 * Deliberately separate from `@/lib/employees/queries`: an employee record and
 * a sign-in account are different things, and the only column that connects
 * them — `employees.user_id` — is not part of the directory's select.
 */

export type UnlinkedEmployee = {
  id: string;
  employee_no: string;
  first_name: string;
  last_name: string;
};

/**
 * Employees who have no login yet.
 *
 * No scope filter, as everywhere else: RLS decides which rows come back, so an
 * HOD running this sees their department and nothing more.
 */
export async function listUnlinkedEmployees(): Promise<{
  rows: UnlinkedEmployee[];
  error: boolean;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("employees")
    .select("id, employee_no, first_name, last_name")
    .is("user_id", null)
    .neq("employment_status", "exited")
    .order("last_name", { ascending: true });

  if (error) return { rows: [], error: true };
  return { rows: (data ?? []) as UnlinkedEmployee[], error: false };
}

// ---------------------------------------------------------------------------
// Role grants
// ---------------------------------------------------------------------------

export type GrantRequestRow = {
  id: string;
  status: "requested" | "awaiting_second_approver" | "active" | "revoked" | "declined";
  reason: string;
  requested_at: string;
  role: string;
  roleHighRisk: boolean;
  targetUserId: string;
  targetName: string;
  requestedById: string;
  requestedByName: string;
  approvedByName: string | null;
};

export type MemberOption = { id: string; label: string };

/**
 * People in this workspace who could be given a role.
 *
 * `profiles` and `organization_members` are two tables joined in JavaScript
 * rather than one PostgREST embed, because the membership's foreign key points
 * at `auth.users` and not at `profiles` — there is no relationship for
 * PostgREST to follow. Both selects are scoped by RLS to this tenant.
 */
export async function listMembers(): Promise<{ rows: MemberOption[] }> {
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("status", "active");

  const ids = (members ?? []).map((m) => m.user_id as string);
  if (ids.length === 0) return { rows: [] };

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", ids);

  return {
    rows: (profiles ?? [])
      .map((p) => ({ id: p.id as string, label: p.full_name as string }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/**
 * Every grant request, newest first.
 *
 * Declined and revoked rows are included deliberately: the table has no delete
 * policy so that the record of who held what survives, and a screen that hid
 * them would undo that on the way to the reader.
 */
export async function listGrantRequests(): Promise<{
  rows: GrantRequestRow[];
  error: boolean;
}> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("role_grant_requests")
    .select(
      `id, status, reason, requested_at, target_user_id, requested_by,
       second_approver_id, role:roles(name, high_risk)`,
    )
    .order("requested_at", { ascending: false })
    .limit(100);

  if (error) return { rows: [], error: true };

  const rows = data ?? [];
  const ids = [
    ...new Set(
      rows.flatMap((r) =>
        [r.target_user_id, r.requested_by, r.second_approver_id].filter(
          (v): v is string => typeof v === "string",
        ),
      ),
    ),
  ];

  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", ids);
    for (const p of profiles ?? []) {
      names.set(p.id as string, p.full_name as string);
    }
  }

  // A name we cannot resolve is shown as such. "Unknown" is accurate — the
  // account may have been deleted — and is better than an empty cell that
  // reads as a rendering bug.
  const nameOf = (id: string | null) =>
    id ? (names.get(id) ?? "Unknown") : null;

  return {
    error: false,
    rows: rows.map((r) => {
      const role = r.role as unknown as {
        name: string;
        high_risk: boolean;
      } | null;
      return {
        id: r.id as string,
        status: r.status as GrantRequestRow["status"],
        reason: r.reason as string,
        requested_at: r.requested_at as string,
        role: role?.name ?? "Unknown role",
        roleHighRisk: Boolean(role?.high_risk),
        targetUserId: r.target_user_id as string,
        targetName: nameOf(r.target_user_id as string) ?? "Unknown",
        requestedById: r.requested_by as string,
        requestedByName: nameOf(r.requested_by as string) ?? "Unknown",
        approvedByName: nameOf(r.second_approver_id as string | null),
      };
    }),
  };
}
