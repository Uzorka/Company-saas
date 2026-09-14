"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { duration, ease } from "@/lib/motion";
import type { NavItem } from "@/lib/navigation";
import type { Permission } from "@/lib/auth/permissions";
import { LinkPending } from "./nav-progress";

/**
 * Desktop sidebar. Source: Developer Handoff section 07.
 *
 * 186px expanded, 58px collapsed. Width transitions 320ms; labels cross-fade
 * 140ms so text never squashes. Items a role cannot open remain visible with a
 * lock glyph and muted ink — clicking one lands on the permission state, not a
 * 404.
 *
 * Items whose screen does not exist yet (`built: false`) render as plain text
 * with a "Soon" marker. They are not links, because a link that 404s is a
 * broken promise; they stay listed, because the module is real and planned.
 */
export function Sidebar({
  items,
  orgName,
  orgInitial,
  collapsed,
  onToggle,
  can,
  basePath,
}: {
  items: NavItem[];
  orgName: string;
  orgInitial: string;
  collapsed: boolean;
  onToggle: () => void;
  can: (permission?: Permission) => boolean;
  basePath: string;
}) {
  const pathname = usePathname();

  return (
    <motion.aside
      animate={{ width: collapsed ? 58 : 186 }}
      initial={false}
      transition={{ duration: duration.slow, ease: ease.standard }}
      className="hidden sm:flex sticky top-0 h-screen shrink-0 flex-col border-r border-border bg-bg"
      aria-label="Main navigation"
    >
      <div className="flex h-[58px] items-center gap-2.5 px-3.5">
        <span className="grid size-[30px] shrink-0 place-items-center rounded-lg bg-brand-600 text-[13px] font-semibold text-white">
          {orgInitial}
        </span>
        <motion.span
          animate={{ opacity: collapsed ? 0 : 1 }}
          transition={{ duration: duration.fast, ease: ease.standard }}
          className="truncate text-small font-semibold"
          aria-hidden={collapsed}
        >
          {orgName}
        </motion.span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        {items.map((navItem) => {
          const href = `${basePath}${navItem.href}`;
          const allowed = can(navItem.permission);
          const active =
            pathname === href || pathname.startsWith(`${href}/`);
          const Icon = navItem.icon;

          const label = (
            <motion.span
              animate={{ opacity: collapsed ? 0 : 1 }}
              transition={{ duration: duration.fast, ease: ease.standard }}
              className="flex-1 truncate text-small"
              aria-hidden={collapsed}
            >
              {navItem.label}
            </motion.span>
          );

          if (!navItem.built) {
            return (
              <div
                key={navItem.label}
                title={collapsed ? `${navItem.label} — not built yet` : undefined}
                className="flex h-[38px] cursor-default items-center gap-2.5 rounded-md px-2.5 text-text-3"
              >
                <Icon className="size-[18px] shrink-0" aria-hidden />
                {label}
                <motion.span
                  animate={{ opacity: collapsed ? 0 : 1 }}
                  transition={{ duration: duration.fast, ease: ease.standard }}
                  className={cn(
                    "shrink-0 rounded-pill bg-canvas px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-3",
                    collapsed && "hidden",
                  )}
                >
                  Soon
                </motion.span>
              </div>
            );
          }

          return (
            <Link
              key={navItem.label}
              href={href}
              aria-current={active ? "page" : undefined}
              title={collapsed ? navItem.label : undefined}
              className={cn(
                "group flex h-[38px] items-center gap-2.5 rounded-md px-2.5",
                "transition-colors duration-(--duration-fast) ease-(--ease-standard)",
                active
                  ? "bg-brand-50 text-brand-700"
                  : allowed
                    ? "text-text-2 hover:bg-canvas hover:text-text"
                    : // Restricted, not hidden.
                      "text-text-3 hover:bg-canvas",
              )}
            >
              <Icon className="size-[18px] shrink-0" aria-hidden />
              {label}
              {/* Sits where the lock would, so the row never changes width. */}
              <LinkPending className={cn(collapsed && "hidden")} />
              {!allowed ? (
                <Lock
                  className={cn("size-3.5 shrink-0", collapsed && "hidden")}
                  aria-label="Restricted"
                />
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-expanded={!collapsed}
          className="flex h-[38px] w-full items-center gap-2.5 rounded-md px-2.5 text-text-3 transition-colors duration-(--duration-fast) hover:bg-canvas hover:text-text"
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px] shrink-0" aria-hidden />
          ) : (
            <PanelLeftClose className="size-[18px] shrink-0" aria-hidden />
          )}
          <motion.span
            animate={{ opacity: collapsed ? 0 : 1 }}
            transition={{ duration: duration.fast, ease: ease.standard }}
            className="truncate text-small"
            aria-hidden={collapsed}
          >
            Collapse
          </motion.span>
        </button>
      </div>
    </motion.aside>
  );
}
