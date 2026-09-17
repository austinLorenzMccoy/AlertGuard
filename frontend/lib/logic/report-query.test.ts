import { describe, expect, it } from "vitest";
import { filterReportsInRange, resolveReportRange } from "@/lib/logic/report-query";
import type { FleetReport } from "@/lib/types";

const now = new Date("2026-09-17T12:00:00.000Z");

describe("resolveReportRange", () => {
  it("resolves this_week as a 7-day window ending now", () => {
    const range = resolveReportRange("this_week", undefined, now);
    expect(range.end).toEqual(now);
    expect(range.start.toISOString().slice(0, 10)).toBe("2026-09-10");
  });

  it("resolves this_month as a 1-month window ending now", () => {
    const range = resolveReportRange("this_month", undefined, now);
    expect(range.start.toISOString().slice(0, 10)).toBe("2026-08-17");
  });

  it("returns the supplied range for custom", () => {
    const custom = { start: new Date("2026-01-01"), end: new Date("2026-01-31") };
    expect(resolveReportRange("custom", custom, now)).toBe(custom);
  });

  it("throws for custom without a supplied range", () => {
    expect(() => resolveReportRange("custom", undefined, now)).toThrow(
      /customRange is required/,
    );
  });
});

describe("filterReportsInRange", () => {
  const reports: FleetReport[] = [
    {
      id: "r1",
      fleet_id: "f1",
      period_start: "2026-09-01",
      period_end: "2026-09-07",
      avg_safety_score: 80,
      total_sessions: 10,
      total_critical_alerts: 1,
      generated_at: "2026-09-08T00:00:00.000Z",
    },
    {
      id: "r2",
      fleet_id: "f1",
      period_start: "2026-07-01",
      period_end: "2026-07-07",
      avg_safety_score: 70,
      total_sessions: 8,
      total_critical_alerts: 0,
      generated_at: "2026-07-08T00:00:00.000Z",
    },
  ];

  it("keeps reports whose period overlaps the range", () => {
    const range = { start: new Date("2026-08-25"), end: new Date("2026-09-17") };
    const filtered = filterReportsInRange(reports, range);
    expect(filtered.map((r) => r.id)).toEqual(["r1"]);
  });

  it("excludes reports entirely outside the range", () => {
    const range = { start: new Date("2026-09-10"), end: new Date("2026-09-17") };
    const filtered = filterReportsInRange(reports, range);
    expect(filtered).toEqual([]);
  });

  it("returns an empty array when there are no reports", () => {
    const range = { start: new Date("2026-01-01"), end: new Date("2026-12-31") };
    expect(filterReportsInRange([], range)).toEqual([]);
  });
});
