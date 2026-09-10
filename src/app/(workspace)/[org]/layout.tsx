import { AppShell } from "@/components/shell/app-shell";
import type { RoleSlug } from "@/lib/navigation";

/**
 * Workspace layout. Org scoping lives in the URL from day one because the
 * design puts an organisation switcher in the topbar before there is a second
 * tenant.
 *
 * Phase 1 renders the shell with a fixed demo identity so the chrome can be
 * reviewed. Phase 2 replaces this block with the authenticated session: the
 * org resolved from the slug and checked against the user's memberships, and
 * the role and permissions read from the verified JWT claims — never from
 * anything the browser supplies.
 */
const DEMO = {
  orgName: "CHF Heron Nigeria",
  userName: "Amaka Duru",
  role: "hr" as RoleSlug,
  roleLabel: "HR",
  permissions: [
    "employees.view_all",
    "departments.view",
    "attendance.view_all",
    "leave.view_all",
    "recruitment.view",
    "documents.view",
    "reports.hr",
  ],
  notificationCount: 3,
};

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  return (
    <AppShell
      org={org}
      orgName={DEMO.orgName}
      role={DEMO.role}
      roleLabel={DEMO.roleLabel}
      permissions={DEMO.permissions}
      userName={DEMO.userName}
      notificationCount={DEMO.notificationCount}
      crumbs={[{ label: DEMO.orgName, href: `/${org}/dashboard` }]}
    >
      {children}
    </AppShell>
  );
}
