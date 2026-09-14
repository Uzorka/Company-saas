import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isSupabaseConfigured, MISSING_SUPABASE_MESSAGE } from "./config";

/**
 * Request-scoped server client. Carries the user's JWT, so RLS applies.
 * This is the default on the server — reach for the service-role client only
 * where bypassing RLS is genuinely required.
 *
 * Wrapped in React's cache() so one request gets one client rather than one
 * per call site. A page and its layout each used to build their own, and each
 * client re-reads cookies and re-establishes its auth state.
 */
export const createClient = cache(async function createClient() {
  if (!isSupabaseConfigured()) throw new Error(MISSING_SUPABASE_MESSAGE);

  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh is handled in middleware instead.
          }
        },
      },
    },
  );
});
