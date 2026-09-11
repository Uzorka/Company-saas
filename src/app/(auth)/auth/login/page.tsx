import Link from "next/link";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

/**
 * Sign in. Source: Phase 2 - Public Website, Phase 3 - Auth and App Shell.
 *
 * Three fields and one primary action. The company code selects a workspace
 * and is remembered after the first success; it is not a credential.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="rounded-xl border border-border bg-bg p-6 shadow-e1">
      <h1 className="text-h1">Sign in</h1>
      <p className="mt-2 text-body text-text-2">
        Enter your company code and work email to reach your workspace.
      </p>

      <LoginForm next={next} />

      <div className="mt-5 flex flex-col gap-2 border-t border-border pt-5 text-small">
        <Link href="/auth/forgot" className="text-brand-600 hover:underline">
          Forgot your password?
        </Link>
        <p className="text-text-2">
          Trouble signing in? Ask your HR team to check your account is active.
        </p>
      </div>
    </div>
  );
}
