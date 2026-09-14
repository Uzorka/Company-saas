import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

/**
 * These guard a bug that shipped invisibly: tailwind-merge read `text-body`
 * (a font size in this theme) as a text colour, so it dropped `text-white`
 * from every primary button and the label rendered near-black on dark blue.
 */
describe("cn — the type scale is a size, not a colour", () => {
  it("keeps a text colour alongside a type-scale size", () => {
    expect(cn("text-white", "text-body")).toBe("text-white text-body");
  });

  it("keeps the button case that broke", () => {
    const result = cn("bg-brand-600 text-white", "h-[44px] px-5 text-body");
    expect(result).toContain("text-white");
    expect(result).toContain("text-body");
  });

  it("still lets one colour override another", () => {
    expect(cn("text-white", "text-text-2")).toBe("text-text-2");
  });

  it("still lets one size override another", () => {
    expect(cn("text-body", "text-small")).toBe("text-small");
  });

  it("leaves unrelated classes alone", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center");
  });
});
