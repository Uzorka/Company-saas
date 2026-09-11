import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { StatusPill } from "@/components/ui/status-pill";
import { EmptyState } from "@/components/states";
import { signOut } from "../actions";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";

export const metadata = { title: "Choose a workspace" };

// This page is per-session by definition. It reads cookies through the
// Supabase client, but the configuration guard below returns before that on an
// unconfigured environment, so the dependency has to be declared explicitly —
// otherwise the build tries to prerender it and fails.
export const dynamic = "force-dynamic";

/**
 * Workspace picker. Source: Developer Handoff, Auth screen spec.
 *
 * "Single-workspace users skip the picker entirely" — so this page redirects
 * rather than rendering a list of one.
 *
 * The memberships read here come back through RLS: members_select_self is
 * deliberately not org-scoped, because at this point no organization has been
 * chosen and no org claim exists yet.
 */
export default async function WorkspacePage() {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/auth/login");

  const { data: memberships, error } = await supabase
    .from("organization_members")
    .select("status, last_active_at, organizations(id, name, slug, status)")
    .eq("status", "active");

  if (error) {
    return (
      <div className="rounded-xl border border-border bg-bg p-6 shadow-e1">
        <h1 className="text-h1">Couldn&rsquo;t load your workspaces</h1>
        <p className="mt-2 text-body text-text-2">
          The request failed. Your data is safe.
        </p>
        <Link href="/auth/workspace" className="mt-5 inline-block">
          <Button variant="secondary">Try again</Button>
        </Link>
      </div>
    );
  }

  const workspaces = (memberships ?? [])
    .map((m) => ({
      ...(m.organizations as unknown as {
        id: string;
        name: string;
        slug: string;
        status: string;
      }),
      lastActiveAt: m.last_active_at as string | null,
    }))
    .filter((w) => w?.slug);

  if (workspaces.length === 1) {
    redirect(`/${workspaces[0].slug}/dashboard`);
  }

  if (workspaces.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          heading="No workspace yet"
          body="Your account exists but isn't attached to a company yet. Ask your HR team to add you — they'll see your account waiting."
        />
        <form action={signOut}>
          <Button variant="secondary" className="w-full" type="submit">
            Sign out
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg p-6 shadow-e1">
      <h1 className="text-h1">Choose a workspace</h1>
      <p className="mt-2 text-body text-text-2">
        You belong to {workspaces.length} companies.
      </p>

      <ul className="mt-6 flex flex-col gap-2">
        {workspaces.map((workspace) => (
          <li key={workspace.id}>
            <Link
              href={`/${workspace.slug}/dashboard`}
              className="flex items-center gap-3 rounded-lg border border-border p-3 transition-shadow duration-(--duration-fast) hover:shadow-e2"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-600 text-[11px] font-semibold text-white">
                {workspace.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small font-medium">
                  {workspace.name}
                </span>
                <span className="block truncate font-mono text-[11px] text-text-3">
                  {workspace.slug}
                </span>
              </span>
              {workspace.status === "trial" ? (
                <StatusPill tone="warn">Trial</StatusPill>
              ) : workspace.status === "suspended" ? (
                <StatusPill tone="danger">Suspended</StatusPill>
              ) : null}
              <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>

      <form action={signOut} className="mt-5 border-t border-border pt-5">
        <Button variant="ghost" type="submit" className="w-full">
          Sign out
        </Button>
      </form>
    </div>
  );
}
