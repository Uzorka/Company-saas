"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { SlideOver } from "@/components/ui/slide-over";
import { Button } from "@/components/ui/button";
import { setAppearance } from "@/lib/messages/actions";
import {
  THEMES,
  LAYOUTS,
  themeStyles,
  layoutStyles,
  type Theme,
  type Layout,
} from "@/lib/messages/appearance";
import { cn } from "@/lib/utils";

/**
 * How this conversation looks, to you.
 *
 * Only to you. The other people in the room keep whatever they chose, which is
 * both how WhatsApp behaves and the only arrangement that does not need two
 * colleagues to agree on a colour before either can read comfortably.
 *
 * Choosing applies immediately rather than behind a Save: the preview is the
 * conversation behind the panel, and a colour you have to commit to before
 * seeing is not a choice anyone can make well.
 */
export function AppearancePanel({
  org,
  conversationId,
  open,
  onClose,
  theme,
  layout,
}: {
  org: string;
  conversationId: string;
  open: boolean;
  onClose: () => void;
  theme: Theme;
  layout: Layout;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>();

  function apply(nextTheme: Theme, nextLayout: Layout) {
    setError(undefined);
    const formData = new FormData();
    formData.set("org", org);
    formData.set("conversationId", conversationId);
    formData.set("theme", nextTheme);
    formData.set("layout", nextLayout);
    startTransition(async () => {
      const result = await setAppearance({}, formData);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  }

  return (
    <SlideOver
      open={open}
      onClose={onClose}
      title="How this looks"
      subtitle="Yours alone — nobody else's view of this conversation changes."
    >
      <div className="flex flex-col gap-5">
        <fieldset>
          <legend className="text-small font-medium">Colour</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {THEMES.map((option) => {
              const style = themeStyles[option];
              const active = option === theme;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => apply(option, layout)}
                  disabled={pending}
                  aria-pressed={active}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border p-2.5 text-left text-small",
                    "transition-colors duration-(--duration-fast) ease-(--ease-standard)",
                    active
                      ? "border-brand-600 bg-brand-50"
                      : "border-border hover:bg-surface",
                  )}
                >
                  <span
                    className={cn("size-6 shrink-0 rounded-md", style.swatch)}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{style.label}</span>
                  {active ? <Check className="size-4 shrink-0" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-small font-medium">Spacing</legend>
          <div className="mt-2 flex gap-2">
            {LAYOUTS.map((option) => (
              <Button
                key={option}
                variant={option === layout ? "primary" : "secondary"}
                size="sm"
                onClick={() => apply(theme, option)}
                disabled={pending}
                aria-pressed={option === layout}
              >
                {layoutStyles[option].label}
              </Button>
            ))}
          </div>
          <p className="mt-2 text-small text-text-2">
            Compact fits more on a phone screen and is easier to scan; comfortable
            is easier to read for long.
          </p>
        </fieldset>

        {error ? (
          <p role="alert" className="text-small text-danger-fg">
            {error}
          </p>
        ) : null}
      </div>
    </SlideOver>
  );
}
