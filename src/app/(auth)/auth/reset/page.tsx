import { ResetForm } from "./reset-form";

export const metadata = { title: "Choose a new password" };

/**
 * Supabase delivers the recovery token in the URL fragment, which never
 * reaches the server. The client component below picks up the resulting
 * session, so there is no token to read here.
 */
export default function ResetPage() {
  return (
    <div className="rounded-xl border border-border bg-bg p-6 shadow-e1">
      <h1 className="text-h1">Choose a new password</h1>
      <p className="mt-2 text-body text-text-2">
        At least 10 characters, with one number and one symbol.
      </p>
      <ResetForm />
    </div>
  );
}
