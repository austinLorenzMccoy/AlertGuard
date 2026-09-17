import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { buildTestSeed } from "@/lib/data/test-fixtures";

const getDataSourceMock = vi.fn();
vi.mock("@/lib/data/get-data-source", () => ({ getDataSource: () => getDataSourceMock() }));

import ReportsPage from "@/app/(dashboard)/reports/page";

describe("ReportsPage", () => {
  it("renders reports for the demo fleet", async () => {
    getDataSourceMock.mockReturnValue(
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
    getDataSourceMock.mockReturnValue(createFakeDataSource(buildTestSeed({ fleets: [] })));
    const element = await ReportsPage();
    render(element);
    expect(screen.getByRole("heading", { name: "Reports & export" })).toBeInTheDocument();
  });
});
