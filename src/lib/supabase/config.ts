/**
 * Whether Supabase is configured for this environment.
 *
 * Checked before creating a client so a missing .env.local produces a clear,
 * actionable screen rather than a 500 with a stack trace. This is the first
 * thing anyone cloning the repository hits, and "safe error messages, never a
 * stack trace" applies to developers too.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export const MISSING_SUPABASE_MESSAGE =
  "Supabase is not configured. Copy .env.example to .env.local and fill in " +
  "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.";
