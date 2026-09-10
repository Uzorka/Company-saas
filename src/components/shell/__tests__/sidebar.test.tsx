import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sidebar } from "@/components/shell/sidebar";
import { navByRole } from "@/lib/navigation";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chfheron/dashboard",
}));

function renderSidebar(permissions: string[]) {
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
    const gated = navByRole.hr.filter((item) => item.permission).length;
    expect(locks).toHaveLength(gated);
  });

  it("shows no lock once the permissions are granted", () => {
    const all = navByRole.hr
      .map((item) => item.permission)
      .filter((p): p is string => Boolean(p));
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
