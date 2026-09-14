import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page not found" };

/**
 * The last resort, for URLs outside any workspace.
 *
 * The framework's default is an unstyled "404 — This page could not be found",
 * which gives no indication the rest of the product is fine or how to get back
 * to it. This at least looks like the product and offers a way out.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-canvas px-4 text-center">
      <div>
        <p className="font-mono text-small text-text-3">404</p>
        <h1 className="mt-2 text-h1">There&rsquo;s no page at this address</h1>
        <p className="mx-auto mt-2 max-w-[48ch] text-body text-text-2">
          The link may be mistyped, or it may be from an older version of the
          site. Everything else is working.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2.5">
        <Link href="/" className={buttonVariants()}>
          Go to the home page
        </Link>
        <Link
          href="/auth/login"
          className={buttonVariants({ variant: "secondary" })}
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
