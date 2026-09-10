import { cn } from "@/lib/utils";

/**
 * Avatar. Source: Developer Handoff section 06.
 * Initials fall back to two characters on brand-50 with brand-700 ink.
 */
const sizes = { sm: "size-6 text-[10px]", md: "size-8 text-[11px]", lg: "size-10 text-small" };

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({
  name,
  src,
  size = "md",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const initials = initialsOf(name);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      className={cn("rounded-pill object-cover", sizes[size], className)}
    />
  ) : (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-grid place-items-center rounded-pill bg-brand-50 font-semibold text-brand-700",
        sizes[size],
        className,
      )}
    >
      {initials}
    </span>
  );
}
