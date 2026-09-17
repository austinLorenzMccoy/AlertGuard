import { describe, expect, it } from "vitest";
import { jsonStubPdfRenderer, shapeFleetReportForPdf } from "@/lib/logic/pdf-export";
import type { Fleet, FleetReport } from "@/lib/types";

const fleet: Fleet = { id: "f1", name: "Lacoco Fleet", owner_id: "m1", created_at: "2026-01-01T00:00:00.000Z" };
const generatedAt = new Date("2026-09-17T00:00:00.000Z");

describe("shapeFleetReportForPdf", () => {
  it("returns an empty-state document when there are no reports", () => {
    const doc = shapeFleetReportForPdf(fleet, [], generatedAt);
    expect(doc.title).toBe("Lacoco Fleet — Safety Report");
    expect(doc.subtitle).toMatch(/no report periods/i);
    expect(doc.summary).toEqual([]);
    expect(doc.periods).toEqual([]);
  });

  it("falls back to 'Unknown fleet' when fleet is null", () => {
    const doc = shapeFleetReportForPdf(null, [], generatedAt);
    expect(doc.title).toBe("Unknown fleet — Safety Report");
  });

  it("aggregates totals and averages across reports", () => {
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
        period_start: "2026-08-25",
        period_end: "2026-08-31",
        avg_safety_score: 90,
        total_sessions: 5,
        total_critical_alerts: 0,
        generated_at: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "r3",
        fleet_id: "f1",
        period_start: "2026-09-08",
        period_end: "2026-09-14",
        avg_safety_score: 85,
        total_sessions: 6,
        total_critical_alerts: 1,
        generated_at: "2026-09-15T00:00:00.000Z",
      },
    ];
    const doc = shapeFleetReportForPdf(fleet, reports, generatedAt);
    expect(doc.subtitle).toBe("2026-08-25 to 2026-09-14");
    expect(doc.summary).toEqual([
      { label: "Total verified sessions", value: "21" },
      { label: "Total critical alerts", value: "2" },
      { label: "Average safety score", value: "85.0" },
    ]);
    expect(doc.periods).toHaveLength(3);
    expect(doc.periods[0].avgSafetyScore).toBe("80.0");
  });

  it("handles reports with a null avg_safety_score", () => {
    const reports: FleetReport[] = [
      {
        id: "r1",
        fleet_id: "f1",
        period_start: "2026-09-01",
        period_end: "2026-09-07",
        avg_safety_score: null,
        total_sessions: null,
        total_critical_alerts: null,
        generated_at: "2026-09-08T00:00:00.000Z",
      },
    ];
    const doc = shapeFleetReportForPdf(fleet, reports, generatedAt);
    expect(doc.summary).toContainEqual({ label: "Average safety score", value: "N/A" });
    expect(doc.periods[0].avgSafetyScore).toBe("N/A");
    expect(doc.periods[0].totalSessions).toBe(0);
    expect(doc.periods[0].totalCriticalAlerts).toBe(0);
  });
});

describe("jsonStubPdfRenderer", () => {
  it("serializes the document as UTF-8 JSON bytes", () => {
    const doc = shapeFleetReportForPdf(fleet, [], generatedAt);
    const bytes = jsonStubPdfRenderer.render(doc);
    const text = new TextDecoder().decode(bytes);
    expect(JSON.parse(text).title).toBe(doc.title);
  });
});
