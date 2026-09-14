import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/shell/sidebar";
import { navByRole } from "@/lib/navigation";
import type { Permission } from "@/lib/auth/permissions";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chfheron/dashboard",
}));

function renderSidebar(permissions: Permission[]) {
  const granted = new Set(permissions);
  return render(
    <Sidebar
      items={navByRole.hr}
      orgName="CHF Heron Nigeria"
      orgInitial="C"
      collapsed={false}
      onToggle={() => {}}
      can={(permission) => permission === undefined || granted.has(permission)}
      basePath="/chfheron"
    />,
  );
}

describe("Sidebar — restricted, not hidden", () => {
  it("renders every nav item even when the role holds no permissions", () => {
    renderSidebar([]);
    // Silently removing navigation makes users think the product is broken,
    // so a module the role cannot open must still appear.
    for (const item of navByRole.hr) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it("marks items the role cannot open with a lock", () => {
    renderSidebar([]);
    const locks = screen.getAllByLabelText("Restricted");
    // Unbuilt items carry a "Soon" marker instead of a lock — there is no
    // screen behind them to be restricted from.
    const gated = navByRole.hr.filter(
      (item) => item.built && item.permission,
    ).length;
    expect(locks).toHaveLength(gated);
  });

  it("shows no lock once the permissions are granted", () => {
    const all = navByRole.hr
      .map((item) => item.permission)
      .filter((p): p is Permission => Boolean(p));
    renderSidebar(all);
    expect(screen.queryByLabelText("Restricted")).not.toBeInTheDocument();
  });

  it("links each item under the org base path", () => {
    renderSidebar([]);
    expect(screen.getByText("Employees").closest("a")).toHaveAttribute(
      "href",
      "/chfheron/employees",
    );
  });
});

describe("Sidebar — unbuilt screens are not links", () => {
  // The regression this guards: Reports, Settings, Audit, Documents and
  // Notifications sat in the sidebar as ordinary links to routes that did not
  // exist, so clicking them produced a 404.
  it("renders no anchor for an item whose screen is not built", () => {
    renderSidebar([]);
    for (const item of navByRole.hr.filter((navItem) => !navItem.built)) {
      expect(screen.getByText(item.label).closest("a")).toBeNull();
    }
  });

  it("marks every unbuilt item as Soon", () => {
    renderSidebar([]);
    const unbuilt = navByRole.hr.filter((item) => !item.built).length;
    expect(unbuilt).toBeGreaterThan(0);
    expect(screen.getAllByText("Soon")).toHaveLength(unbuilt);
  });

  it("still links every built item", () => {
    renderSidebar([]);
    for (const item of navByRole.hr.filter((navItem) => navItem.built)) {
      expect(screen.getByText(item.label).closest("a")).toHaveAttribute(
        "href",
        `/chfheron${item.href}`,
      );
    }
  });
});
