"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Search } from "lucide-react";
import { dialog, duration, ease } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/navigation";
import { useProgrammaticNav } from "./nav-progress";

/**
 * Command palette. Source: Developer Handoff section 07.
 *
 * ⌘K from anywhere. Arrows move, Enter runs, Esc closes. Scoped results —
 * screens for now; people and actions land with their modules.
 *
 * The dialog body is a separate component that only mounts while open, so its
 * query and selection start fresh every time without an effect resetting them.
 */
export function CommandPalette({
  open,
  onOpenChange,
  items,
  basePath,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: NavItem[];
  basePath: string;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
      if (event.key === "Escape" && open) onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <AnimatePresence>
      {open ? (
        <PaletteDialog
          items={items}
          basePath={basePath}
          onClose={() => onOpenChange(false)}
        />
      ) : null}
    </AnimatePresence>
  );
}

function PaletteDialog({
  items,
  basePath,
  onClose,
}: {
  items: NavItem[];
  basePath: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [, navigate] = useProgrammaticNav();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Unbuilt screens are excluded rather than listed and refused: the palette
  // exists to go somewhere, and an entry that cannot be run is noise.
  const results = items.filter(
    (item) =>
      item.built &&
      item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function run(index: number) {
    const target = results[index];
    if (!target) return;
    onClose();
    // Inside a transition so the top bar lights up: the palette closes
    // instantly, and without this there is nothing on screen saying the jump
    // it just started is still running.
    navigate(() => router.push(`${basePath}${target.href}`));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.32 }}
        exit={{ opacity: 0 }}
        transition={{ duration: duration.base, ease: ease.standard }}
        className="absolute inset-0 bg-[#131a22]"
        onClick={onClose}
      />
      <motion.div
        {...dialog}
        className="relative w-full max-w-[520px] overflow-hidden rounded-xl border border-border bg-bg shadow-e4"
      >
        <div className="flex items-center gap-2.5 border-b border-border px-4">
          <Search className="size-[18px] text-text-3" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(i + 1, results.length - 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                run(active);
              }
            }}
            placeholder="Search screens…"
            aria-label="Search screens"
            className="h-[52px] flex-1 bg-transparent text-body outline-none placeholder:text-text-3"
          />
        </div>

        <ul className="max-h-[320px] overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-6 text-center text-small text-text-2">
              No screens match “{query}”.
            </li>
          ) : (
            results.map((item, index) => {
              const Icon = item.icon;
              return (
                <li key={item.label}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => run(index)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-small",
                      index === active
                        ? "bg-brand-50 text-brand-700"
                        : "text-text-2",
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {item.label}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </motion.div>
    </div>
  );
}
