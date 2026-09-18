"use client";

import { themeStyles, layoutStyles, THEMES } from "@/lib/messages/appearance";
import { cn } from "@/lib/utils";

/**
 * Harness. Renders the bubble layout for every theme so it can be looked at,
 * and its contrast measured, without a signed-in session.
 *
 * The conversation itself needs Supabase and a membership; this is the part
 * that is pure presentation, which is the part that goes wrong silently.
 */
export default function ChatCheck() {
  const density = layoutStyles.comfortable;
  return (
    <div style={{ padding: 24 }}>
      {THEMES.map((theme) => {
        const look = themeStyles[theme];
        return (
          <div key={theme} data-theme-block={theme} className="mb-6">
            <p className="mb-2 text-small font-semibold">{look.label}</p>
            <ol className={cn("flex flex-col rounded-xl p-4", density.gap, look.surface)}>
              <li className="flex max-w-full gap-2 self-start">
                <span className="w-8 shrink-0" />
                <div
                  data-bubble="theirs"
                  className={cn("max-w-[78%] rounded-xl shadow-e1", density.bubble, look.theirs)}
                >
                  <p className={density.text}>Two trucks are held at Apapa.</p>
                  <p className="mt-1 text-right text-[11px] text-text-3">09:12</p>
                </div>
              </li>
              <li className="mt-2 flex max-w-full flex-row-reverse gap-2 self-end">
                <span className="w-8 shrink-0" />
                <div
                  data-bubble="mine"
                  className={cn("max-w-[78%] rounded-xl shadow-e1", density.bubble, look.mine)}
                >
                  <p className={density.text}>On my way with the paperwork.</p>
                  <p className="mt-1 text-right text-[11px] text-white/70">09:14</p>
                </div>
              </li>
            </ol>
          </div>
        );
      })}
    </div>
  );
}
