import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseConfigured, MISSING_SUPABASE_MESSAGE } from "./config";

/**
 * Browser client. Carries the user's session, so RLS applies to every query.
 * Never used for anything that needs to bypass RLS.
 */
export function createClient() {
  if (!isSupabaseConfigured()) throw new Error(MISSING_SUPABASE_MESSAGE);

  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
