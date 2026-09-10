import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * Phase 1 placeholder for the public site. The designed marketing pages land
 * in Phase 8 with a real content layer — nothing here asserts company facts,
 * because the copy in the design pack is sample content pending the client's
 * own (see docs/BACKLOG.md).
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[68ch] flex-col justify-center gap-5 px-6 py-16">
      <span className="grid size-[30px] place-items-center rounded-lg bg-brand-600 text-[13px] font-semibold text-white">
        H
      </span>
      <h1 className="text-display">Heron</h1>
      <p className="text-body text-text-2">
        Multi-tenant company management — people, attendance verification,
        field visits, leave, payroll and recruitment. The public site is built
        in Phase 8.
      </p>
      <div>
        <Link href="/chfheron/dashboard" className={buttonVariants()}>
          Open the workspace
        </Link>
      </div>
    </main>
  );
}
