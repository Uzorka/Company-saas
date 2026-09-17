"use client";

import { motion } from "motion/react";
import { listItem, smooth, staggerDelay } from "@/lib/motion";

/**
 * A list item that arrives rather than appears.
 *
 * Wraps one row. The delay comes from its position, capped so that a page of
 * fifty records does not leave the last one waiting two seconds — the effect
 * has to be independent of how much data came back, or a busy screen is
 * punished for being busy.
 *
 * Under `prefers-reduced-motion` this does nothing: `MotionConfig` in the app
 * shell is set to follow the OS, which drops the transform and leaves the
 * opacity, so the content still arrives — it just stops moving.
 *
 * `animate` rather than `whileInView`, deliberately. Scroll-triggered reveals
 * mean content below the fold is invisible until you scroll to it, which
 * breaks find-in-page and reads as a bug on a data screen.
 */
export function Reveal({
  index = 0,
  className,
  children,
}: {
  index?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={listItem.initial}
      animate={listItem.animate}
      transition={{ ...smooth, delay: staggerDelay(index) }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * The same arrival for a single block — a card, a panel, a section heading.
 * No stagger, because there is nothing to stagger against.
 */
export function Appear({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={listItem.initial}
      animate={listItem.animate}
      transition={{ ...smooth, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
