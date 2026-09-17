import { describe, expect, it } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { buildTestSeed } from "@/lib/data/test-fixtures";
import { getFleetReports } from "@/lib/data/reports";

describe("getFleetReports", () => {
  it("returns an empty array when there are no reports", async () => {
    const ds = createFakeDataSource(buildTestSeed());
    expect(await getFleetReports(ds, "f1")).toEqual([]);
  });

  it("sorts reports newest period first", async () => {
    const seed = buildTestSeed({
      reports: [
        { id: "old", fleet_id: "f1", period_start: "2026-08-01", period_end: "2026-08-07", avg_safety_score: 70, total_sessions: 5, total_critical_alerts: 0, generated_at: "" },
        { id: "new", fleet_id: "f1", period_start: "2026-09-01", period_end: "2026-09-07", avg_safety_score: 80, total_sessions: 5, total_critical_alerts: 0, generated_at: "" },
      ],
    });
    const ds = createFakeDataSource(seed);
    const reports = await getFleetReports(ds, "f1");
    expect(reports.map((r) => r.id)).toEqual(["new", "old"]);
  });
});
