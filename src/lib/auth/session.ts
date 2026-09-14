import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Permission, Role } from "./permissions";

/**
 * Server-side session and authorisation.
 *
 * This is one of two independent gates. Row Level Security is the other, and
 * neither substitutes for the other: RLS stops a leaked query returning rows
 * it shouldn't, this stops a request reaching a handler it shouldn't and gives
 * the user a designed permission screen rather than an empty list.
 *
 * Everything here reads the *verified* JWT claims that Supabase returns from
 * getClaims(), which validates the token signature. Nothing trusts a value the
 * browser supplies — not a role in a cookie, not an org id in the URL.
 */
export type Session = {
  userId: string;
  email: string | null;
  organizationId: string;
  roles: Role[];
  permissions: Set<Permission>;
};

type HeronClaims = {
  sub?: string;
  email?: string;
  organization_id?: string | null;
  roles?: string[];
  permissions?: string[];
};

/**
 * The current session, or null. Never throws for an unauthenticated caller —
 * callers that require a session use requireSession().
 *
 * Cached for the length of one request. Every page calls this, and so does the
 * layout wrapping it, so without deduplication a single navigation verified
 * the token two or three times over — each one a round trip before any of the
 * page's own data could be fetched.
 */
export const getSession = cache(async function getSession(): Promise<Session | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims) return null;

  const claims = data.claims as HeronClaims;
  if (!claims.sub || !claims.organization_id) return null;

  return {
    userId: claims.sub,
    email: claims.email ?? null,
    organizationId: claims.organization_id,
    roles: (claims.roles ?? []) as Role[],
    permissions: new Set((claims.permissions ?? []) as Permission[]),
  };
});

/**
 * Require a signed-in, org-scoped session. Sends the caller to sign in with a
 * `next` parameter so they land back where they were heading.
 */
export async function requireSession(returnTo?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/auth/login${next}`);
  }
  return session;
}

/**
 * Require that the session is acting in the organization named in the URL.
 *
 * The slug in the path is a *claim by the browser*, so it is checked against
 * the organization on the verified token rather than believed. A mismatch
 * means the user typed or was linked to another tenant's URL: send them to the
 * workspace picker, never render the page.
 */
export const requireOrg = cache(async function requireOrg(
  orgSlug: string,
): Promise<Session> {
  const session = await requireSession();
  const organization = await getOrganization(orgSlug);

  if (!organization || organization.id !== session.organizationId) {
    redirect("/auth/workspace");
  }

  return session;
});

/**
 * The organization named in the URL, once per request.
 *
 * requireOrg() already fetches this row to check the slug against the token,
 * and the workspace layout then fetched it again for the name in the sidebar.
 * Same row, same request, two round trips. Cached on the slug so both callers
 * share one.
 */
export const getOrganization = cache(async function getOrganization(
  orgSlug: string,
): Promise<{ id: string; slug: string; name: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, slug, name")
    .eq("slug", orgSlug)
    .maybeSingle();

  return data ?? null;
});

/** Does this session hold the permission? Union across all of the user's roles. */
export function can(session: Session, permission: Permission): boolean {
  return session.permissions.has(permission);
}

/** Any one of these permissions is enough. */
export function canAny(session: Session, ...permissions: Permission[]): boolean {
  return permissions.some((permission) => session.permissions.has(permission));
}

/**
 * Guard a server action or route handler.
 *
 * Throws rather than redirects: a mutation that the caller is not entitled to
 * make is an error, not a navigation. Pages should check with `can()` and
 * render the permission state instead — the design is explicit that a
 * restricted module shows a designed screen, never a 404.
 */
export function assertPermission(
  session: Session,
  permission: Permission,
): void {
  if (!session.permissions.has(permission)) {
    throw new Error(`Forbidden: ${permission} is required`);
  }
}
