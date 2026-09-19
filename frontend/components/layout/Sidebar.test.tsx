import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const usePathnameMock = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => usePathnameMock(),
}));

import { Sidebar } from "@/components/layout/Sidebar";

describe("Sidebar", () => {
  it("renders every nav item as a real link", () => {
    usePathnameMock.mockReturnValue("/overview");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/overview");
    expect(screen.getByRole("link", { name: "Drivers" })).toHaveAttribute("href", "/drivers");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("marks the exact-match route as current", () => {
    usePathnameMock.mockReturnValue("/overview");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Drivers" })).not.toHaveAttribute("aria-current");
  });

  it("marks a nested route as current via startsWith", () => {
    usePathnameMock.mockReturnValue("/drivers/d1");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Drivers" })).toHaveAttribute("aria-current", "page");
  });

  it("handles a null pathname without crashing", () => {
    usePathnameMock.mockReturnValue(null);
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
  });

  it("links the logo home to the landing page", () => {
    usePathnameMock.mockReturnValue("/overview");
    render(<Sidebar />);
    expect(screen.getByRole("link", { name: "AlertGuard" })).toHaveAttribute("href", "/");
  });

  it("collapses to an icon-only rail and back, keeping nav labels as the accessible name", async () => {
    usePathnameMock.mockReturnValue("/overview");
    const user = userEvent.setup();
    render(<Sidebar />);

    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.click(toggle);

    const expandToggle = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expandToggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("title", "Overview");

    await user.click(expandToggle);

    expect(screen.getByRole("button", { name: "Collapse sidebar" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("title");
  });
});
