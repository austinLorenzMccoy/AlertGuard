import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

const getFleetContextMock = vi.fn();
vi.mock("@/lib/auth/fleet-context", () => ({
  getFleetContext: () => getFleetContextMock(),
}));

import { redirect } from "next/navigation";
import DashboardLayout from "@/app/(dashboard)/layout";

describe("DashboardLayout", () => {
  it("renders the sidebar and children for a demo context", async () => {
    getFleetContextMock.mockResolvedValue({ status: "demo", fleetId: "f1", profile: {} });
    const element = await DashboardLayout({ children: <p>Page content</p> });
    render(element);
    expect(screen.getByText("AlertGuard")).toBeInTheDocument();
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("renders the sidebar and children for an ok context", async () => {
    getFleetContextMock.mockResolvedValue({ status: "ok", fleetId: "f1", profile: {} });
    const element = await DashboardLayout({ children: <p>Page content</p> });
    render(element);
    expect(screen.getByText("Page content")).toBeInTheDocument();
  });

  it("redirects to /login when unauthenticated", async () => {
    getFleetContextMock.mockResolvedValue({ status: "unauthenticated" });
    await expect(DashboardLayout({ children: <p>Page content</p> })).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(redirect).toHaveBeenCalledWith("/login");
  });

  it("redirects to /download when the role is unauthorized", async () => {
    getFleetContextMock.mockResolvedValue({ status: "unauthorized_role", role: "driver" });
    await expect(DashboardLayout({ children: <p>Page content</p> })).rejects.toThrow(
      "NEXT_REDIRECT:/download",
    );
    expect(redirect).toHaveBeenCalledWith("/download");
  });

  it("renders a no-fleet message instead of children when no_fleet", async () => {
    getFleetContextMock.mockResolvedValue({ status: "no_fleet", profile: {} });
    const element = await DashboardLayout({ children: <p>Page content</p> });
    render(element);
    expect(screen.getByText(/No fleet is assigned/)).toBeInTheDocument();
    expect(screen.queryByText("Page content")).not.toBeInTheDocument();
  });
});
