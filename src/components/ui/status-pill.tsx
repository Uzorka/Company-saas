import { cn } from "@/lib/utils";
import { statusClass, statusGlyph, type StatusTone } from "@/lib/status";

/**
 * Status pill. Source: Developer Handoff section 06.
 *
 * Colour plus glyph plus word, always all three. There is deliberately no way
 * to render this without its label — a status that is only a colour fails in
 * greyscale and for colour-blind users.
 */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-overline font-semibold",
        statusClass[tone],
        className,
      )}
    >
      <span aria-hidden>{statusGlyph[tone]}</span>
      {children}
    </span>
  );
}
