import { render, screen } from "@testing-library/react";
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
});
