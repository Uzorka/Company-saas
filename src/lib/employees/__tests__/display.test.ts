import { describe, expect, it } from "vitest";
import {
  employmentStatusLabel,
  employmentStatusTone,
  employmentTypeLabel,
  formatDate,
  fullName,
} from "@/lib/employees/display";

describe("employment status presentation", () => {
  it("gives every status a tone and a word", () => {
    for (const status of Object.keys(employmentStatusLabel) as Array<
      keyof typeof employmentStatusLabel
    >) {
      expect(employmentStatusTone[status]).toBeTruthy();
      expect(employmentStatusLabel[status]).toBeTruthy();
    }
  });

  it("does not present an exited or suspended person as healthy", () => {
    expect(employmentStatusTone.exited).toBe("danger");
    expect(employmentStatusTone.suspended).toBe("danger");
    expect(employmentStatusTone.active).toBe("success");
  });

  it("labels every employment type the schema allows", () => {
    for (const type of ["full_time", "part_time", "contract", "intern", "nysc"]) {
      expect(employmentTypeLabel[type]).toBeTruthy();
    }
  });
});

describe("formatDate", () => {
  it("renders an unambiguous day-month-year", () => {
    // 01/12 vs 12/01 on a hire date is a real misreading, so the format is
    // pinned rather than left to the viewer's locale.
    expect(formatDate("2022-01-12")).toBe("12 Jan 2022");
    expect(formatDate("2025-12-01")).toBe("01 Dec 2025");
  });

  it("renders a dash rather than Invalid Date", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not a date")).toBe("—");
  });
});

describe("fullName", () => {
  it("joins the parts", () => {
    expect(fullName({ first_name: "Adaeze", last_name: "Okonkwo" })).toBe(
      "Adaeze Okonkwo",
    );
  });
});
