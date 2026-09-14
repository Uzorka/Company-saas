import Link from "next/link";
import { requireOrg } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SetupRequired } from "@/components/states/setup-required";
import { EmptyState } from "@/components/states";
import { navByRole, pickPrimaryRole } from "@/lib/navigation";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Not found" };

/**
 * Anything under /[org] with no screen behind it.
 *
 * Two kinds of URL land here and they deserve different answers:
 *
 *   1. A module that is real and planned but not built — /reports, /settings,
 *      /audit, /documents, /notifications. These are marked "Soon" in the
 *      sidebar and are not links, but they can still be typed, bookmarked from
 *      an older build, or followed from a shared link. Telling someone the
 *      page does not exist, when the product says it does, reads as a bug.
 *
 *   2. A genuine typo.
 *
 * Either way this renders inside the app shell, so the sidebar is still there
 * and the person is not dumped onto a bare framework 404 with no way back.
 */
export default async function UnknownWorkspacePage({
  params,
}: {
  params: Promise<{ org: string; unknown: string[] }>;
}) {
  if (!isSupabaseConfigured()) return <SetupRequired />;

  const { org, unknown } = await params;
  const session = await requireOrg(org);

  const path = `/${(unknown ?? []).join("/")}`;
  const role = pickPrimaryRole(session.roles);

  // Is this one of the modules the product lists but has not built yet?
  const planned = navByRole[role].find(
    (item) => !item.built && item.href === path,
  );

  return (
    <div className="flex flex-col gap-5">
      {planned ? (
        <EmptyState
          heading={`${planned.label} isn't built yet`}
          body="It's part of the product and it's coming, which is why it appears in your sidebar marked “Soon”. There's no screen behind it today."
          action={
            <Link
              href={`/${org}/dashboard`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Back to dashboard
            </Link>
          }
        />
      ) : (
        <EmptyState
          heading="There's no screen at this address"
          body={`Nothing in this workspace answers to ${path}. It may have been mistyped, or the link may be from an older version.`}
          action={
            <Link
              href={`/${org}/dashboard`}
              className={buttonVariants({ variant: "secondary" })}
            >
              Back to dashboard
            </Link>
          }
        />
      )}
    </div>
  );
}
