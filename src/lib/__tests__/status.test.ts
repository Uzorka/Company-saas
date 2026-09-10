import { describe, expect, it } from "vitest";
import { statusGlyph, statusClass, type StatusTone } from "@/lib/status";

const tones: StatusTone[] = ["success", "warn", "danger", "info", "mute"];

describe("status vocabulary", () => {
  it("gives every tone a glyph, so colour is never the only cue", () => {
    for (const tone of tones) {
      expect(statusGlyph[tone]).toBeTruthy();
    }
  });

  it("gives every tone a tint and an ink class", () => {
    for (const tone of tones) {
      expect(statusClass[tone]).toMatch(/bg-/);
      expect(statusClass[tone]).toMatch(/text-/);
    }
  });

  it("uses a distinct glyph per tone", () => {
    const glyphs = tones.map((tone) => statusGlyph[tone]);
    expect(new Set(glyphs).size).toBe(tones.length);
  });
});
