import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ usePathname: () => "/overview" }));

import DashboardLayout from "@/app/(dashboard)/layout";

describe("DashboardLayout", () => {
  it("renders the sidebar and children", () => {
    render(
      <DashboardLayout>
        <p>Page content</p>
      </DashboardLayout>,
    );
    expect(screen.getByText("AlertGuard")).toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });
});
