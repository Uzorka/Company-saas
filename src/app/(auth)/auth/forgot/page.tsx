import Link from "next/link";
import { ForgotForm } from "./forgot-form";

export const metadata = { title: "Reset your password" };

export default function ForgotPage() {
  return (
    <div className="rounded-xl border border-border bg-bg p-6 shadow-e1">
      <h1 className="text-h1">Reset your password</h1>
      <p className="mt-2 text-body text-text-2">
        Enter your work email and we&rsquo;ll send you a link to set a new
        password.
      </p>
      <ForgotForm />
      <div className="mt-5 border-t border-border pt-5 text-small">
        <Link href="/auth/login" className="text-brand-600 underline underline-offset-2">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
