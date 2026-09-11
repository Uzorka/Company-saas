import { describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_SLUGS, ROLE_LABELS, MODULE_ROLES } from "@/lib/auth/permissions";

describe("permission vocabulary", () => {
  it("has no duplicates", () => {
    expect(new Set(PERMISSIONS).size).toBe(PERMISSIONS.length);
  });

  it("uses module.action slugs throughout", () => {
    for (const permission of PERMISSIONS) {
      expect(permission).toMatch(/^[a-z]+(\.[a-z_]+)+$/);
    }
  });

  it("labels every role", () => {
    for (const role of ROLE_SLUGS) {
      expect(ROLE_LABELS[role]).toBeTruthy();
    }
  });

  it("keeps payroll out of HR's reach in the permission-state copy", () => {
    // Presentation only, but it must not contradict the matrix — telling a
    // user "HR can open this" for payroll would send them to the wrong desk.
    expect(MODULE_ROLES.Payroll).not.toContain("hr");
    expect(MODULE_ROLES.Payroll).toContain("accounts");
  });

  it("names only Management for Audit and Settings", () => {
    expect(MODULE_ROLES.Audit).toEqual(["management"]);
    expect(MODULE_ROLES.Settings).toEqual(["management"]);
  });

  it("distinguishes self-scoped from org-scoped permissions", () => {
    // "Own only" is a different scope, not a weaker read. Both must exist for
    // every module where an employee sees their own record.
    for (const moduleName of ["attendance", "leave", "employees"]) {
      expect(PERMISSIONS).toContain(`${moduleName}.view_self`);
      expect(PERMISSIONS).toContain(`${moduleName}.view_all`);
    }
    expect(PERMISSIONS).toContain("payroll.view_self");
    expect(PERMISSIONS).toContain("payroll.view_all");
  });
});
