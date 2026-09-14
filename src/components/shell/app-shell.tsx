"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sidebar } from "./sidebar";
import { Topbar, type Crumb } from "./topbar";
import { BottomNav } from "./bottom-nav";
import { CommandPalette } from "./command-palette";
import { bottomSheet, duration, ease } from "@/lib/motion";
import { navByRole, type RoleSlug } from "@/lib/navigation";
import { NavProgress, LinkPending } from "./nav-progress";
import type { Permission } from "@/lib/auth/permissions";
import Link from "next/link";

/**
 * App shell. Source: Phase 3 - Auth and App Shell.
 *
 * Everything else mounts inside this. Org scoping, role resolution and the
 * role-filtered sidebar are settled here before any module is built —
 * retrofitting multi-tenancy is the most expensive mistake available.
 *
 * `permissions` is the caller's resolved permission set. It arrives from the
 * server; this component never derives authority from it, it only decides
 * which nav items render unlocked. Authorisation is enforced server-side and
 * in RLS.
 */
export function AppShell({
  org,
  orgName,
  role,
  permissions,
  userName,
  roleLabel,
  crumbs,
  children,
}: {
  org: string;
  orgName: string;
  role: RoleSlug;
  permissions: string[];
  userName: string;
  roleLabel: string;
  crumbs: Crumb[];
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const basePath = `/${org}`;
  const items = navByRole[role];
  const granted = new Set<string>(permissions);
  const can = (permission?: Permission) =>
    permission === undefined || granted.has(permission);

  return (
    <div className="flex min-h-screen bg-canvas">
      <NavProgress />

      <a href="#main" className="sr-only-focusable">
        Skip to content
      </a>

      <Sidebar
        items={items}
        orgName={orgName}
        orgInitial={orgName.charAt(0).toUpperCase()}
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        can={can}
        basePath={basePath}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          crumbs={crumbs}
          userName={userName}
          roleLabel={roleLabel}
          orgName={orgName}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        <main
          id="main"
          className="mx-auto w-full max-w-content-max flex-1 px-4 pb-[74px] pt-5 sm:px-6 sm:pb-8"
        >
          {children}
        </main>
      </div>

      <BottomNav basePath={basePath} onOpenMore={() => setMoreOpen(true)} />

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        items={items}
        basePath={basePath}
      />

      {/* More sheet — phone only, same options in the same order as the sidebar. */}
      <AnimatePresence>
        {moreOpen ? (
          <div
            className="fixed inset-0 z-50 sm:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="More"
          >
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.32 }}
              exit={{ opacity: 0 }}
              transition={{ duration: duration.slow, ease: ease.standard }}
              className="absolute inset-0 bg-[#131a22]"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              {...bottomSheet}
              className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-xl bg-bg p-4 shadow-e4"
            >
              <div
                className="mx-auto mb-4 h-1 w-10 rounded-pill bg-border-hi"
                aria-hidden
              />
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.label}>
                      {item.built ? (
                        <Link
                          href={`${basePath}${item.href}`}
                          onClick={() => setMoreOpen(false)}
                          className="flex h-[44px] items-center gap-2.5 rounded-md px-3 text-small text-text-2"
                        >
                          <Icon className="size-[18px]" aria-hidden />
                          {item.label}
                          <LinkPending className="ml-auto" />
                        </Link>
                      ) : (
                        <div className="flex h-[44px] items-center gap-2.5 rounded-md px-3 text-small text-text-3">
                          <Icon className="size-[18px]" aria-hidden />
                          {item.label}
                          <span className="ml-auto rounded-pill bg-canvas px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide">
                            Soon
                          </span>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
