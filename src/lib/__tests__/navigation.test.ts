import { describe, expect, it } from "vitest";
import { navByRole, mobileNav, type RoleSlug } from "@/lib/navigation";

const roles: RoleSlug[] = ["management", "hr", "accounts", "hod", "employee"];

describe("role navigation", () => {
  it("defines navigation for all five roles", () => {
    for (const role of roles) {
      expect(navByRole[role].length).toBeGreaterThan(0);
    }
  });

  it("starts every role at the dashboard", () => {
    for (const role of roles) {
      expect(navByRole[role][0].href).toBe("/dashboard");
    }
  });

  it("keeps HR out of payroll — HR has no payroll access in the matrix", () => {
    const labels = navByRole.hr.map((item) => item.label);
    expect(labels).not.toContain("Payroll");
    expect(labels).not.toContain("Payslips");
  });

  it("keeps Accounts out of HR-owned modules", () => {
    const labels = navByRole.accounts.map((item) => item.label);
    expect(labels).not.toContain("Recruitment");
    expect(labels).not.toContain("Leave");
  });

  it("gives only Management the audit log", () => {
    for (const role of roles) {
      const hasAudit = navByRole[role].some((item) => item.label === "Audit");
      expect(hasAudit).toBe(role === "management");
    }
  });

  it("holds the mobile bottom nav to four items including More", () => {
    // The design caps the bottom nav at four; More is rendered by the nav
    // component itself, so the configured list is at most three.
    expect(mobileNav.length).toBeLessThanOrEqual(3);
  });
});
