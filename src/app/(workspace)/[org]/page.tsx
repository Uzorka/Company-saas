import { notFound, redirect } from "next/navigation";
import { getOrganization } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * The bare workspace URL, e.g. /chfheron.
 *
 * There was no page here, so anyone who bookmarked the workspace root, trimmed
 * the path in the address bar, or shared a link without the screen on the end
 * got a flat 404 from a product they were signed into. Every route below this
 * one exists; the entrance did not.
 *
 * The organization is checked before redirecting. `[org]` is a dynamic segment
 * at the top of the route tree, so without this check every unmatched
 * single-segment URL in the whole product — /nope, /favicon-typo, anything —
 * would be treated as a workspace and bounced into a dashboard that cannot
 * exist. An unknown slug is a 404, which is what it was before this page was
 * added and what it should stay.
 *
 * It redirects rather than rendering a second copy of the dashboard, so there
 * is one dashboard URL and the breadcrumb, the sidebar's active state and the
 * browser history all agree on it.
 */
export default async function WorkspaceRootPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;

  // Without Supabase there is nothing to check the slug against, and the
  // dashboard renders its own setup screen. Send them there rather than
  // claiming a workspace does not exist when nothing can be looked up.
  if (isSupabaseConfigured()) {
    const organization = await getOrganization(org);
    if (!organization) notFound();
  }

  redirect(`/${org}/dashboard`);
}
