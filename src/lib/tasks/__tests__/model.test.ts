import { describe, expect, it } from "vitest";
import {
  BOARD_COLUMNS,
  isOverdue,
  priorityLabel,
  priorityTone,
  statusLabel,
  statusTone,
  TASK_PRIORITIES,
  TASK_STATUSES,
  verificationMode,
  VERIFICATION_MODES,
  visitStateLabel,
  visitStateTone,
  VISIT_STATES,
} from "@/lib/tasks/model";

describe("task vocabulary", () => {
  it("labels and tones every status and priority", () => {
    for (const status of TASK_STATUSES) {
      expect(statusLabel[status]).toBeTruthy();
      expect(statusTone[status]).toBeTruthy();
    }
    for (const priority of TASK_PRIORITIES) {
      expect(priorityLabel[priority]).toBeTruthy();
      expect(priorityTone[priority]).toBeTruthy();
    }
  });

  it("keeps cancelled off the board", () => {
    // A lane for abandoned work fills up and never empties. Cancelled is a
    // filter, not a column.
    expect(BOARD_COLUMNS).not.toContain("cancelled");
    expect(BOARD_COLUMNS).toHaveLength(4);
  });

  it("escalates priority tone rather than colouring everything the same", () => {
    expect(priorityTone.urgent).toBe("danger");
    expect(priorityTone.high).toBe("warn");
    expect(priorityTone.low).toBe("mute");
  });
});

describe("verification modes", () => {
  it("describes all five", () => {
    for (const mode of VERIFICATION_MODES) {
      expect(verificationMode[mode].label).toBeTruthy();
      expect(verificationMode[mode].description).toBeTruthy();
    }
  });

  it("makes 'no proof' a real mode, not an oversight", () => {
    // The design: "Do not force field verification on every task."
    const none = verificationMode.none;
    expect(none.needsPhoto).toBe(false);
    expect(none.needsLocation).toBe(false);
    expect(none.needsReport).toBe(false);
  });

  it("escalates requirements monotonically", () => {
    expect(verificationMode.photo.needsPhoto).toBe(true);
    expect(verificationMode.photo.needsLocation).toBe(false);

    expect(verificationMode.location.needsLocation).toBe(true);
    expect(verificationMode.location.needsPhoto).toBe(false);

    expect(verificationMode.photo_location.needsPhoto).toBe(true);
    expect(verificationMode.photo_location.needsLocation).toBe(true);
    expect(verificationMode.photo_location.needsReport).toBe(false);

    const full = verificationMode.photo_location_report;
    expect(full.needsPhoto).toBe(true);
    expect(full.needsLocation).toBe(true);
    expect(full.needsReport).toBe(true);
  });

  it("only the fullest mode demands a written report", () => {
    const withReport = VERIFICATION_MODES.filter(
      (mode) => verificationMode[mode].needsReport,
    );
    expect(withReport).toEqual(["photo_location_report"]);
  });
});

describe("visit states", () => {
  it("labels and tones every state", () => {
    for (const state of VISIT_STATES) {
      expect(visitStateLabel[state]).toBeTruthy();
      expect(visitStateTone[state]).toBeTruthy();
    }
  });

  it("does not present a returned visit as a success", () => {
    expect(visitStateTone.verified).toBe("success");
    expect(visitStateTone.returned).toBe("danger");
    expect(visitStateTone.flagged).toBe("warn");
  });
});

describe("isOverdue", () => {
  const today = new Date(2026, 8, 13); // 13 Sep 2026

  it("is false for a task due today", () => {
    // Due today is not late at 09:00. Treating it as overdue makes every
    // morning look like a crisis.
    expect(isOverdue("2026-09-13", "todo", today)).toBe(false);
  });

  it("is true for a task due yesterday", () => {
    expect(isOverdue("2026-09-12", "todo", today)).toBe(true);
  });

  it("is false for a task due tomorrow", () => {
    expect(isOverdue("2026-09-14", "todo", today)).toBe(false);
  });

  it("is false without a due date", () => {
    expect(isOverdue(null, "todo", today)).toBe(false);
  });

  it("never marks finished work overdue", () => {
    expect(isOverdue("2026-01-01", "completed", today)).toBe(false);
    expect(isOverdue("2026-01-01", "cancelled", today)).toBe(false);
    expect(isOverdue("2026-01-01", "in_progress", today)).toBe(true);
  });
});
