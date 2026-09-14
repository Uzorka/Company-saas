import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { requireOrg, getOrganization } from "@/lib/auth/session";
import { AppShell } from "@/components/shell/app-shell";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { pickPrimaryRole } from "@/lib/navigation";

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

  // getOrganization is the same cached lookup requireOrg just used, so this
  // costs nothing. Only the profile is a new round trip, and it runs alongside.
  const [organization, { data: profile }] = await Promise.all([
    getOrganization(org),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", session.userId)
      .maybeSingle(),
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

