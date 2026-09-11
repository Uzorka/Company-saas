import { describe, expect, it } from "vitest";
import { buildEmployeeSearchFilter } from "@/lib/employees/search";

describe("buildEmployeeSearchFilter", () => {
  it("searches name, employee number and email", () => {
    const filter = buildEmployeeSearchFilter("adaeze");
    expect(filter).toContain("first_name.ilike.%adaeze%");
    expect(filter).toContain("last_name.ilike.%adaeze%");
    expect(filter).toContain("employee_no.ilike.%adaeze%");
    expect(filter).toContain("work_email.ilike.%adaeze%");
  });

  it("returns null for an empty or whitespace term", () => {
    expect(buildEmployeeSearchFilter("")).toBeNull();
    expect(buildEmployeeSearchFilter("   ")).toBeNull();
  });

  // Each of these would otherwise be parsed as PostgREST filter syntax.
  it("strips commas, which delimit an or() group", () => {
    const filter = buildEmployeeSearchFilter("Okonkwo, Adaeze");
    expect(filter).not.toContain("Okonkwo,");
    expect(filter).toContain("Okonkwo Adaeze");
  });

  it("strips parentheses, which close an or() group", () => {
    const filter = buildEmployeeSearchFilter("Bello (Sales)");
    expect(filter).not.toMatch(/[()]/);
    expect(filter).toContain("Bello Sales");
  });

  it("collapses the whitespace stripping leaves behind", () => {
    // A double space in an ILIKE pattern matches nothing, so removing a
    // delimiter must not silently break the search that follows it.
    expect(buildEmployeeSearchFilter("Okonkwo,  Adaeze")).toContain(
      "%Okonkwo Adaeze%",
    );
    expect(buildEmployeeSearchFilter("  Tunde   Bello  ")).toContain(
      "%Tunde Bello%",
    );
  });

  it("returns null when a term is only delimiters", () => {
    expect(buildEmployeeSearchFilter("(),")).toBeNull();
  });
});
