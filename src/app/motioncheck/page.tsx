"use client";

import { motion } from "motion/react";
import { pageTransition } from "@/lib/motion";

/**
 * Harness. Does the page-transition wrapper break `position: fixed` inside it?
 *
 * A transformed element becomes the containing block for fixed descendants, so
 * a residual `transform` left behind after the animation settles would move
 * every slide-over and scrim in the app off the viewport. Measured rather than
 * reasoned about — see scripts/motion-test.mjs.
 */
export default function MotionCheck() {
  return (
    <div style={{ padding: 40, minHeight: "200vh" }}>
      <motion.div key="harness" {...pageTransition} data-testid="wrapper">
        <p>content above the fixed child</p>
        <div
          data-testid="fixed-child"
          style={{ position: "fixed", inset: 0, pointerEvents: "none" }}
        />
      </motion.div>
    </div>
  );
}
