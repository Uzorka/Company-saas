import { describe, expect, it } from "vitest";
import { safeRedirect } from "@/lib/auth/redirect";

describe("safeRedirect", () => {
  it("allows a same-origin path", () => {
    expect(safeRedirect("/chfheron/attendance")).toBe("/chfheron/attendance");
  });

  it("keeps the query string", () => {
    expect(safeRedirect("/chfheron/tasks?view=board")).toBe(
      "/chfheron/tasks?view=board",
    );
  });

  it("falls back when there is no target", () => {
    expect(safeRedirect(null)).toBe("/auth/workspace");
    expect(safeRedirect(undefined)).toBe("/auth/workspace");
    expect(safeRedirect("")).toBe("/auth/workspace");
  });

  // Each of these is a real open-redirect vector: our own sign-in page,
  // reached from a link an attacker sent, bouncing to their site after a
  // genuine sign-in.
  it("rejects an absolute URL", () => {
    expect(safeRedirect("https://evil.example/login")).toBe("/auth/workspace");
    expect(safeRedirect("http://evil.example")).toBe("/auth/workspace");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeRedirect("//evil.example")).toBe("/auth/workspace");
    expect(safeRedirect("//evil.example/path")).toBe("/auth/workspace");
  });

  it("rejects a backslash-prefixed URL, which some browsers treat as a slash", () => {
    expect(safeRedirect("/\\evil.example")).toBe("/auth/workspace");
    expect(safeRedirect("\\\\evil.example")).toBe("/auth/workspace");
  });

  it("rejects a javascript: scheme", () => {
    expect(safeRedirect("javascript:alert(1)")).toBe("/auth/workspace");
  });

  it("rejects a data: scheme", () => {
    expect(safeRedirect("data:text/html,<script>alert(1)</script>")).toBe(
      "/auth/workspace",
    );
  });

  it("honours an explicit fallback", () => {
    expect(safeRedirect("https://evil.example", "/auth/login")).toBe(
      "/auth/login",
    );
  });
});
