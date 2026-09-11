import { Card, CardBody } from "@/components/ui/card";

/**
 * Shown when the app runs without Supabase configured — a fresh clone before
 * .env.local exists. Names the cause and the fix, rather than failing with a
 * stack trace.
 */
export function SetupRequired() {
  return (
    <div className="mx-auto max-w-[560px] py-12">
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div>
            <p className="text-overline uppercase text-text-3">Setup</p>
            <h1 className="mt-1 text-h2">Supabase isn&rsquo;t configured yet</h1>
          </div>
          <p className="text-body text-text-2">
            The workspace needs a Supabase project before it can sign anyone in.
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-body text-text-2">
            <li>
              Copy <code className="font-mono text-small">.env.example</code> to{" "}
              <code className="font-mono text-small">.env.local</code>.
            </li>
            <li>
              Fill in{" "}
              <code className="font-mono text-small">
                NEXT_PUBLIC_SUPABASE_URL
              </code>{" "}
              and{" "}
              <code className="font-mono text-small">
                NEXT_PUBLIC_SUPABASE_ANON_KEY
              </code>
              .
            </li>
            <li>
              Apply the migrations in{" "}
              <code className="font-mono text-small">supabase/migrations/</code>{" "}
              and register the access token hook.
            </li>
            <li>Restart the dev server.</li>
          </ol>
          <p className="border-t border-border pt-4 text-small text-text-3">
            Full steps are in <code className="font-mono">docs/DEPLOYMENT.md</code>.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
