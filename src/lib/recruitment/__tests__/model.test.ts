import { describe, expect, it } from "vitest";
import {
  BOARD_STAGES,
  isTerminal,
  MOVABLE_STAGES,
  stageLabel,
  stageTone,
  STAGES,
} from "@/lib/recruitment/model";

describe("recruitment stages", () => {
  it("has the design's eight stages", () => {
    expect(STAGES).toHaveLength(8);
    for (const stage of STAGES) {
      expect(stageLabel[stage]).toBeTruthy();
      expect(stageTone[stage]).toBeTruthy();
    }
  });

  it("keeps rejected and withdrawn on the board", () => {
    // The design keeps them visible; hiding them would make the funnel look
    // better than it is, and candidates stay searchable for 12 months.
    expect(BOARD_STAGES).toContain("rejected");
    expect(BOARD_STAGES).toContain("withdrawn");
    expect(BOARD_STAGES).toHaveLength(8);
  });

  it("does not offer 'hired' as a stage move", () => {
    // Hiring creates an employee record. Offering it as a drag target would
    // let someone mark a person hired with no record behind it.
    expect(MOVABLE_STAGES).not.toContain("hired");
    expect(MOVABLE_STAGES).toHaveLength(7);
  });

  it("does not present a rejection as a success", () => {
    expect(stageTone.rejected).toBe("danger");
    expect(stageTone.offered).toBe("success");
    expect(stageTone.hired).toBe("success");
  });

  it("identifies the terminal stages", () => {
    expect(isTerminal("hired")).toBe(true);
    expect(isTerminal("rejected")).toBe(true);
    expect(isTerminal("withdrawn")).toBe(true);
    expect(isTerminal("interview")).toBe(false);
    expect(isTerminal("applied")).toBe(false);
  });
});
