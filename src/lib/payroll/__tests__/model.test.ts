import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneyCompact,
  nextTransition,
  payrollStatusLabel,
  payrollStatusMeaning,
  payrollStatusTone,
  PAYROLL_STATUSES,
} from "@/lib/payroll/model";

describe("payroll status vocabulary", () => {
  it("labels, tones and explains every status", () => {
    for (const status of PAYROLL_STATUSES) {
      expect(payrollStatusLabel[status]).toBeTruthy();
      expect(payrollStatusTone[status]).toBeTruthy();
      expect(payrollStatusMeaning[status]).toBeTruthy();
    }
  });

  it("states the consequence on the irreversible step", () => {
    // The design: irreversible actions restate what will happen, in the same
    // words, everywhere they appear.
    expect(payrollStatusMeaning.published).toMatch(/cannot be undone/i);
    expect(payrollStatusMeaning.approved).toMatch(/locked/i);
  });
});

describe("nextTransition", () => {
  it("follows the six-status pipeline in order", () => {
    expect(nextTransition.processing?.to).toBe("review");
    expect(nextTransition.review?.to).toBe("approved");
    expect(nextTransition.approved?.to).toBe("published");
    expect(nextTransition.published?.to).toBe("closed");
    expect(nextTransition.closed).toBeNull();
  });

  it("requires a different permission for approving than for processing", () => {
    // Separation of duties starts with the permission, not just the UI.
    expect(nextTransition.review?.permission).toBe("payroll.approve");
    expect(nextTransition.processing?.permission).toBe("payroll.process");
    expect(nextTransition.approved?.permission).toBe("payroll.publish");
  });

  it("marks only publication irreversible", () => {
    const irreversible = PAYROLL_STATUSES.filter(
      (status) => nextTransition[status]?.irreversible,
    );
    expect(irreversible).toEqual(["approved"]); // the step *from* approved
  });
});

describe("formatMoney", () => {
  it("renders naira with two decimals", () => {
    // Non-breaking spaces vary by runtime, so assert on the parts.
    const formatted = formatMoney("377600.00");
    expect(formatted).toContain("377,600.00");
    expect(formatted).toMatch(/₦|NGN/);
  });

  it("accepts the decimal strings Postgres returns", () => {
    expect(formatMoney("310000.50")).toContain("310,000.50");
    expect(formatMoney(310000.5)).toContain("310,000.50");
  });

  it("shows a dash rather than NaN or zero for a missing figure", () => {
    // Rendering a missing salary as ₦0.00 would be a lie about someone's pay.
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney("")).toBe("—");
    expect(formatMoney("not a number")).toBe("—");
  });

  it("keeps the kobo", () => {
    expect(formatMoney("0.01")).toContain("0.01");
    expect(formatMoney("1234.56")).toContain("1,234.56");
  });
});

describe("formatMoneyCompact", () => {
  it("abbreviates millions and thousands", () => {
    expect(formatMoneyCompact(48_200_000)).toBe("₦48.20m");
    expect(formatMoneyCompact(61_410_000)).toBe("₦61.41m");
    expect(formatMoneyCompact(12_500)).toBe("₦12.5k");
  });

  it("shows small amounts in full", () => {
    expect(formatMoneyCompact(950)).toBe("₦950.00");
  });

  it("handles a missing figure the same way", () => {
    expect(formatMoneyCompact(null)).toBe("—");
  });
});
