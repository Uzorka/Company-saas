import Image from "next/image";
import { brand } from "@/content/brand";
import { cn } from "@/lib/utils";

/**
 * The tenant's mark.
 *
 * Renders the supplied logo file when there is one. There is not: the asset
 * lives on the client's own server and this environment cannot fetch it to
 * vendor a copy, and hotlinking someone else's server for a logo is fragile
 * and impolite.
 *
 * So the fallback is a typographic wordmark following the structure their own
 * brand description gives — "CHF" in the brand blue with an orange accent, and
 * a smaller "HERON" beside it. It reads as their identity without pretending
 * to be artwork nobody here has seen. Drop the real file into /public, point
 * `brand.logo.assetPath` at it, and this steps aside.
 */
export function BrandMark({
  className,
  size = "md",
}: {
  className?: string;
  /** sm for the compact sidebar, md everywhere else. */
  size?: "sm" | "md";
}) {
  if (brand.logo.assetPath) {
    return (
      <Image
        src={brand.logo.assetPath}
        alt="CHF Heron Nigeria"
        width={size === "sm" ? 96 : 132}
        height={size === "sm" ? 24 : 32}
        className={cn("h-auto w-auto", className)}
        priority
      />
    );
  }

  return (
    <span className={cn("flex items-baseline gap-1.5", className)} aria-label="CHF Heron Nigeria">
      <span
        className={cn(
          "font-[family-name:var(--font-display)] font-extrabold tracking-tight text-brand-600",
          size === "sm" ? "text-[17px]" : "text-[21px]",
        )}
        aria-hidden
      >
        {brand.logo.wordmark.lead}
        {/* The orange accent their mark carries. Decorative, no text on it. */}
        <span className="text-accent">.</span>
      </span>
      <span
        className={cn(
          "font-[family-name:var(--font-display)] font-semibold uppercase tracking-[0.18em] text-text-2",
          size === "sm" ? "text-[9px]" : "text-[11px]",
        )}
        aria-hidden
      >
        {brand.logo.wordmark.trail}
      </span>
    </span>
  );
}
