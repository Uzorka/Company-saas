"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { LinkPending } from "./nav-progress";
import { mobileNav } from "@/lib/navigation";

/**
 * Mobile bottom nav. Source: Developer Handoff section 07.
 *
 * Four items maximum: Home, Attendance, Tasks, More. Everything else lives
 * behind More. There is deliberately no hamburger drawer recreating the
 * sidebar — the design rules that out.
 */
export function BottomNav({
  basePath,
  onOpenMore,
}: {
  basePath: string;
  onOpenMore: () => void;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex h-[58px] border-t border-border bg-bg sm:hidden"
      aria-label="Main navigation"
    >
      {mobileNav.map((navItem) => {
        const href = `${basePath}${navItem.href}`;
        const active = pathname === href || pathname.startsWith(`${href}/`);
        const Icon = navItem.icon;
        return (
          <Link
            key={navItem.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-1",
              active ? "text-brand-700" : "text-text-3",
            )}
          >
            <Icon className="size-[18px]" aria-hidden />
            <LinkPending />
            <span className="text-[11px] leading-none">{navItem.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMore}
        className="flex flex-1 flex-col items-center justify-center gap-1 text-text-3"
        aria-label="More"
      >
        <Menu className="size-[18px]" aria-hidden />
        <span className="text-[11px] leading-none">More</span>
      </button>
    </nav>
  );
}
