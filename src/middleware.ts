import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Session refresh and route protection.
 *
 * Two jobs:
 *  1. Refresh the Supabase session cookie on every request. Server Components
 *     cannot write cookies, so without this a session silently expires
 *     mid-visit and the user is bounced for no visible reason.
 *  2. Keep unauthenticated callers out of the workspace, and signed-in callers
 *     out of the auth screens.
 *
 * This is a coarse gate, not the authorisation boundary. It knows only whether
 * *a* session exists — never what that session may do. Permission checks
 * happen in the page or action, and again in RLS.
 */
const PUBLIC_PATHS = ["/", "/about", "/services", "/careers", "/contact"];
const AUTH_PREFIX = "/auth";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without Supabase configured there is no session to refresh and nothing to
  // protect — let the request through rather than failing every route with an
  // opaque error. The app surfaces the missing configuration where it matters.
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Refreshes the session as a side effect. Do not remove.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname } = request.nextUrl;
  const isPublic =
    PUBLIC_PATHS.includes(pathname) || pathname.startsWith("/careers/");
  const isAuthRoute = pathname.startsWith(AUTH_PREFIX);

  if (!signedIn && !isPublic && !isAuthRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    // Preserve where they were going, so sign-in returns them there. Only the
    // path and query travel — never an absolute URL, which would let an open
    // redirect through.
    redirectUrl.search = `?next=${encodeURIComponent(pathname + request.nextUrl.search)}`;
    return NextResponse.redirect(redirectUrl);
  }

  if (signedIn && isAuthRoute && !pathname.startsWith("/auth/workspace")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/workspace";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
