import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { buildTestSeed } from "@/lib/data/test-fixtures";

const getServerDataSourceMock = vi.fn();
vi.mock("@/lib/data/get-data-source", () => ({
  getServerDataSource: () => getServerDataSourceMock(),
}));

const getFleetContextMock = vi.fn();
vi.mock("@/lib/auth/fleet-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/fleet-context")>();
  return { ...actual, getFleetContext: () => getFleetContextMock() };
});

import ReportsPage from "@/app/(dashboard)/reports/page";

describe("ReportsPage", () => {
  it("renders reports for the demo fleet", async () => {
    getFleetContextMock.mockResolvedValue({ status: "demo", fleetId: FLEET_ID, profile: {} });
    getServerDataSourceMock.mockReturnValue(
      createFakeDataSource(
        buildTestSeed({
          fleets: [{ id: FLEET_ID, name: "Fleet One", owner_id: null, created_at: "" }],
          reports: [
            { id: "r1", fleet_id: FLEET_ID, period_start: "2026-09-01", period_end: "2026-09-30", avg_safety_score: 80, total_sessions: 10, total_critical_alerts: 1, generated_at: "" },
          ],
        }),
      ),
    );
    const element = await ReportsPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Reports & export" })).toBeInTheDocument();
  });

  it("passes a null fleet through when none matches", async () => {
    getFleetContextMock.mockResolvedValue({ status: "demo", fleetId: FLEET_ID, profile: {} });
    getServerDataSourceMock.mockReturnValue(createFakeDataSource(buildTestSeed({ fleets: [] })));
    const element = await ReportsPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Reports & export" })).toBeInTheDocument();
  });

  it("never renders page content when the fleet context isn't resolved", async () => {
    getFleetContextMock.mockResolvedValue({ status: "unauthenticated" });
    await expect(ReportsPage()).rejects.toThrow(/Fleet context is not resolved/);
  });
});
