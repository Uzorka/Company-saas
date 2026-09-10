"use client";

import Link from "next/link";
import { Bell, ChevronDown, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type Crumb = { label: string; href?: string };

/**
 * Topbar. Source: Developer Handoff section 07.
 *
 * Breadcrumb, search, notification bell with count, avatar menu. The org
 * switcher is present from day one — this is a multi-tenant product and the
 * shell says so before there is a second tenant.
 *
 * Breadcrumb is two levels maximum and the last segment is the current screen,
 * never a link.
 */
export function Topbar({
  crumbs,
  userName,
  roleLabel,
  orgName,
  notificationCount = 0,
  onOpenPalette,
}: {
  crumbs: Crumb[];
  userName: string;
  roleLabel: string;
  orgName: string;
  notificationCount?: number;
  onOpenPalette: () => void;
}) {
  const trail = crumbs.slice(-2);

  return (
    <header className="sticky top-0 z-30 flex h-[58px] items-center gap-3 border-b border-border bg-bg px-4 sm:px-6">
      <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
        <ol className="flex items-center gap-2 text-small">
          {trail.map((crumb, index) => {
            const isLast = index === trail.length - 1;
            return (
              <li key={crumb.label} className="flex min-w-0 items-center gap-2">
                {index > 0 ? (
                  <span className="text-text-3" aria-hidden>
                    /
                  </span>
                ) : null}
                {isLast || !crumb.href ? (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className="truncate font-medium text-text"
                  >
                    {crumb.label}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="truncate text-text-2 hover:text-text"
                  >
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <button
        type="button"
        onClick={onOpenPalette}
        className="hidden items-center gap-2 rounded-md border border-border-hi bg-surface px-3 text-small text-text-3 h-[34px] md:flex hover:bg-canvas"
        aria-label="Open command palette"
      >
        <Search className="size-4" aria-hidden />
        <span>Search</span>
        <kbd className="ml-2 rounded-sm border border-border bg-bg px-1.5 font-mono text-[10px] text-text-3">
          ⌘K
        </kbd>
      </button>

      <Link
        href="notifications"
        className="relative grid size-[38px] place-items-center rounded-md text-text-2 hover:bg-canvas hover:text-text"
        aria-label={
          notificationCount > 0
            ? `Notifications, ${notificationCount} unread`
            : "Notifications"
        }
      >
        <Bell className="size-[18px]" aria-hidden />
        {notificationCount > 0 ? (
          <span
            className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-pill bg-danger-fg px-1 font-mono text-[10px] leading-4 text-white"
            aria-hidden
          >
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        ) : null}
      </Link>

      <button
        type="button"
        className={cn(
          "flex items-center gap-2 rounded-md px-2 h-[38px] hover:bg-canvas",
        )}
        aria-label={`${userName}, ${roleLabel} at ${orgName}. Open account menu`}
      >
        <Avatar name={userName} size="md" />
        <span className="hidden text-left lg:block">
          <span className="block text-small font-medium leading-tight">
            {userName}
          </span>
          <span className="block text-[11px] leading-tight text-text-3">
            {roleLabel}
          </span>
        </span>
        <ChevronDown className="size-4 text-text-3" aria-hidden />
      </button>
    </header>
  );
}
