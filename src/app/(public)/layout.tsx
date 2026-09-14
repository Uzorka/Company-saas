import Link from "next/link";
import { company } from "@/content/company";
import { buttonVariants } from "@/components/ui/button";
import { DemoNotice } from "@/components/demo-notice";
import { NavProgress } from "@/components/shell/nav-progress";
import { BrandMark } from "@/components/brand-mark";

/**
 * Public site shell. Source: Phase 2 - Public Website.
 *
 * Deliberately separate from the workspace shell: this is a different surface
 * with different navigation, and the design treats it that way ("No app
 * components — this is a separate surface").
 */
const nav = [
  { label: "About", href: "/about" },
  { label: "Services", href: "/services" },
  { label: "Careers", href: "/careers" },
  { label: "Contact", href: "/contact" },
];

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <NavProgress />
      <DemoNotice />

      <header className="border-b border-border">
        <div className="mx-auto flex max-w-content-max flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center">
            <BrandMark />
          </Link>

          <nav className="ml-auto flex flex-wrap items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-small text-text-2 hover:bg-canvas hover:text-text"
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/auth/login"
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-surface">
        <div className="mx-auto flex max-w-content-max flex-wrap gap-6 px-4 py-8 sm:px-6">
          <div className="min-w-[200px] flex-1">
            <BrandMark size="sm" />
            <p className="mt-2 text-small font-semibold">{company.legalName}</p>
            <p className="mt-1 text-small text-text-2">{company.tagline}</p>
            <p className="mt-1 text-small text-text-2">
              Distributing in Nigeria since {company.foundedYear}.
            </p>
            {/* text-2, not text-3: at 13px the muted token measures 3.46:1 on
                this surface, under the 4.5:1 minimum. This paragraph is the
                notice that keeps the whole deployment honest, so it is the
                last thing that should be hard to read. */}
            {company.demo.isDemo ? (
              <p className="mt-3 max-w-[46ch] text-small text-text-2">
                {company.demo.notice}
              </p>
            ) : null}
          </div>
          <nav className="flex flex-col gap-2">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-small text-text-2 hover:text-text"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
