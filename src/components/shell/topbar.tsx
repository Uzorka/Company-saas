"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, LogOut, Search } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { signOut } from "@/app/(auth)/auth/actions";

export type Crumb = { label: string; href?: string };

/**
 * Topbar. Source: Developer Handoff section 07.
 *
 * Breadcrumb, search, account menu. The org switcher is present from day one —
 * this is a multi-tenant product and the shell says so before there is a
 * second tenant.
 *
 * Breadcrumb is two levels maximum and the last segment is the current screen,
 * never a link.
 *
 * The design also specifies a notification bell. It is not here: there is no
 * notifications screen for it to open and no notifications table to count, so
 * it would be an icon with a permanently empty badge that leads nowhere. It
 * returns with the screen — see docs/BACKLOG.md.
 */
export function Topbar({
  crumbs,
  userName,
  roleLabel,
  orgName,
  onOpenPalette,
}: {
  crumbs: Crumb[];
  userName: string;
  roleLabel: string;
  orgName: string;
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

      <AccountMenu
        userName={userName}
        roleLabel={roleLabel}
        orgName={orgName}
      />
    </header>
  );
}

/**
 * Account menu. Previously this was an avatar, a chevron and no handler — the
 * one control every signed-in user reaches for, wired to nothing. Sign-out is
 * a server action, so the item is a form submit rather than an onClick.
 */
function AccountMenu({
  userName,
  roleLabel,
  orgName,
}: {
  userName: string;
  roleLabel: string;
  orgName: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 h-[38px] hover:bg-canvas",
          open && "bg-canvas",
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

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-[236px] overflow-hidden rounded-lg border border-border bg-bg shadow-e3"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-small font-medium">{userName}</p>
            <p className="truncate text-[11px] text-text-3">
              {roleLabel} · {orgName}
            </p>
          </div>
          <form action={signOut}>
            <button
              type="submit"
              role="menuitem"
              className="flex h-[38px] w-full items-center gap-2.5 px-3 text-left text-small text-text-2 hover:bg-canvas hover:text-text"
            >
              <LogOut className="size-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
