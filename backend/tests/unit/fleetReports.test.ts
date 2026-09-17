import { describe, it, expect, vi } from "vitest";
import {
  getPreviousWeekPeriod,
  computeFleetAggregate,
  generateFleetReports,
  type FleetReportsDeps,
} from "../../supabase/functions/_shared/fleetReports.ts";

describe("getPreviousWeekPeriod", () => {
  it("returns the prior Monday-Sunday week when reference date is a Wednesday", () => {
    // 2026-01-14 is a Wednesday
    const period = getPreviousWeekPeriod(new Date("2026-01-14T10:00:00.000Z"));
    expect(period).toEqual({ periodStart: "2026-01-05", periodEnd: "2026-01-11" });
  });

  it("returns the prior full week when reference date is exactly a Monday (cron firing at week start)", () => {
    // 2026-01-12 is a Monday
    const period = getPreviousWeekPeriod(new Date("2026-01-12T00:00:00.000Z"));
    expect(period).toEqual({ periodStart: "2026-01-05", periodEnd: "2026-01-11" });
  });

  it("handles a reference date that is a Sunday", () => {
    // 2026-01-11 is a Sunday
    const period = getPreviousWeekPeriod(new Date("2026-01-11T23:59:00.000Z"));
    expect(period).toEqual({ periodStart: "2025-12-29", periodEnd: "2026-01-04" });
  });

  it("handles a month boundary correctly", () => {
    // 2026-02-03 is a Tuesday
    const period = getPreviousWeekPeriod(new Date("2026-02-03T00:00:00.000Z"));
    expect(period).toEqual({ periodStart: "2026-01-26", periodEnd: "2026-02-01" });
  });
});

describe("computeFleetAggregate", () => {
  it("averages only the scored sessions", () => {
    const result = computeFleetAggregate(
      [{ safety_score: 80 }, { safety_score: 100 }, { safety_score: null }],
      2
    );
    expect(result).toEqual({ avgSafetyScore: 90, totalSessions: 3, totalCriticalAlerts: 2 });
  });

  it("returns 0 average when there are no scored sessions", () => {
    const result = computeFleetAggregate([{ safety_score: null }, { safety_score: null }], 0);
    expect(result).toEqual({ avgSafetyScore: 0, totalSessions: 2, totalCriticalAlerts: 0 });
  });

  it("returns 0/0/0 for an empty session list", () => {
    const result = computeFleetAggregate([], 0);
    expect(result).toEqual({ avgSafetyScore: 0, totalSessions: 0, totalCriticalAlerts: 0 });
  });

  it("rounds the average to 2 decimal places", () => {
    const result = computeFleetAggregate(
      [{ safety_score: 100 }, { safety_score: 90 }, { safety_score: 85 }],
      0
    );
    expect(result.avgSafetyScore).toBe(91.67);
  });

  it("ignores non-finite safety scores when averaging", () => {
    const result = computeFleetAggregate(
      [{ safety_score: 80 }, { safety_score: NaN }],
      0
    );
    expect(result.avgSafetyScore).toBe(80);
  });

  it("clamps a negative critical-alert count to zero", () => {
    const result = computeFleetAggregate([{ safety_score: 100 }], -3);
    expect(result.totalCriticalAlerts).toBe(0);
  });
});

describe("generateFleetReports", () => {
  function makeDeps(overrides: Partial<FleetReportsDeps> = {}): FleetReportsDeps {
    return {
      listFleetIds: vi.fn().mockResolvedValue(["fleet-1", "fleet-2"]),
      getSessionsForFleetInPeriod: vi.fn().mockResolvedValue([{ safety_score: 90 }]),
      getCriticalAlertCountForFleetInPeriod: vi.fn().mockResolvedValue(1),
      insertFleetReport: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("generates and inserts one report row per fleet for the previous week", async () => {
    const deps = makeDeps();
    const referenceDate = new Date("2026-01-14T00:00:00.000Z");

    const rows = await generateFleetReports(deps, referenceDate);

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      fleetId: "fleet-1",
      periodStart: "2026-01-05",
      periodEnd: "2026-01-11",
      avgSafetyScore: 90,
      totalSessions: 1,
      totalCriticalAlerts: 1,
    });
    expect(deps.insertFleetReport).toHaveBeenCalledTimes(2);
    expect(deps.getSessionsForFleetInPeriod).toHaveBeenCalledWith("fleet-1", {
      periodStart: "2026-01-05",
      periodEnd: "2026-01-11",
    });
  });

  it("returns an empty array when there are no fleets", async () => {
    const deps = makeDeps({ listFleetIds: vi.fn().mockResolvedValue([]) });
    const rows = await generateFleetReports(deps, new Date("2026-01-14T00:00:00.000Z"));
    expect(rows).toEqual([]);
    expect(deps.insertFleetReport).not.toHaveBeenCalled();
  });
});
