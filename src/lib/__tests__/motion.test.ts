import { describe, expect, it } from "vitest";
import { duration, ease } from "@/lib/motion";

describe("motion tokens", () => {
  it("matches the five designed durations", () => {
    expect(duration).toEqual({
      instant: 0.08,
      fast: 0.14,
      base: 0.2,
      slow: 0.32,
      confirm: 0.42,
    });
  });

  it("defines exactly three easings", () => {
    expect(Object.keys(ease)).toEqual(["standard", "enter", "exit"]);
  });

  it("reserves the longest duration for confirmation moments only", () => {
    const others = [
      duration.instant,
      duration.fast,
      duration.base,
      duration.slow,
    ];
    expect(Math.max(...others)).toBeLessThan(duration.confirm);
  });
});
