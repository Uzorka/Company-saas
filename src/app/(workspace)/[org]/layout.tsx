import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { requireOrg } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import type { RoleSlug } from "@/lib/navigation";

/**
 * Workspace layout.
 *
 * The org slug in the URL is a claim by the browser, so requireOrg() checks it
 * against the organization on the verified JWT rather than trusting it. A
 * mismatch sends the user to the workspace picker instead of rendering.
 *
 * Roles and permissions come from the signed token, stamped there by the
 * access token hook from the database. Nothing here is derived from anything
 * the client can set.
 */
export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  // Before anything touches the database: an unconfigured environment gets a
  // screen that says what to do, not a stack trace.
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const session = await requireOrg(org);

  const supabase = await createClient();

  const [{ data: organization }, { data: profile }, { count: unread }] =
    await Promise.all([
      supabase
        .from("organizations")
        .select("name")
        .eq("id", session.organizationId)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", session.userId)
        .maybeSingle(),
      // Notifications land in Phase 5; until the table exists this stays 0
      // rather than showing an invented badge count.
      Promise.resolve({ count: 0 }),
    ]);

  // A user may hold several roles — the union decides what they can do. The
  // sidebar needs one layout, so it uses the most privileged they hold.
  const primaryRole = pickPrimaryRole(session.roles);

  return (
    <AppShell
      org={org}
      orgName={organization?.name ?? org}
      role={primaryRole}
      roleLabel={ROLE_LABELS[primaryRole]}
      permissions={[...session.permissions]}
      userName={profile?.full_name ?? session.email ?? "Your account"}
      notificationCount={unread ?? 0}
      crumbs={[
        {
          label: organization?.name ?? org,
          href: `/${org}/dashboard`,
        },
      ]}
    >
      {children}
    </AppShell>
  );
}

/**
 * Which sidebar to show when a user holds more than one role.
 *
 * Permissions are always the union — this only picks a nav layout, never what
 * the user may do. Ordered most to least privileged so someone who is both an
 * HOD and an employee gets the fuller navigation, not the narrower one.
 */
const ROLE_PRECEDENCE: Role[] = [
  "management",
  "hr",
  "accounts",
  "hod",
  "employee",
];

function pickPrimaryRole(roles: Role[]): RoleSlug {
  for (const candidate of ROLE_PRECEDENCE) {
    if (roles.includes(candidate)) return candidate;
  }
  return "employee";
}
