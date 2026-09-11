"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { duration, ease, slideOver } from "@/lib/motion";
import { IconButton } from "./button";

/**
 * Slide-over. Source: Developer Handoff section 06.
 *
 * 480px desktop, 80% tablet, full-screen mobile. Esc and the scrim close it,
 * and focus returns to whatever opened it — a row click that loses your place
 * in a long directory is worse than a page navigation.
 *
 * The list deliberately stays visible behind it: the design's reason for
 * choosing a slide-over over a detail page in the first place.
 */
export function SlideOver({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    returnFocusTo.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusTo.current?.focus();
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.32 }}
            exit={{ opacity: 0 }}
            transition={{ duration: duration.slow, ease: ease.standard }}
            className="absolute inset-0 bg-[#131a22]"
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            {...slideOver}
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-bg shadow-e4 outline-none sm:w-[80%] lg:w-[480px]"
          >
            <header className="flex items-start gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-h3">{title}</h2>
                {subtitle ? (
                  <p className="mt-0.5 truncate text-small text-text-2">
                    {subtitle}
                  </p>
                ) : null}
              </div>
              <IconButton
                label="Close"
                icon={<X className="size-[18px]" />}
                onClick={onClose}
              />
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>

            {footer ? (
              <footer className="border-t border-border px-5 py-4">
                {footer}
              </footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
}
