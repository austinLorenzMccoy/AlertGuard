import { describe, expect, it } from "vitest";
import { buildFleetReportsCsv, toCsv } from "@/lib/logic/csv-export";
import type { FleetReport } from "@/lib/types";

describe("toCsv", () => {
  it("builds a header row plus one row per item", () => {
    const csv = toCsv(
      [{ a: 1, b: "x" }],
      [
        { key: "a", label: "A", value: (r) => r.a },
        { key: "b", label: "B", value: (r) => r.b },
      ],
    );
    expect(csv).toBe("A,B\r\n1,x");
  });

  it("quotes fields containing commas", () => {
    const csv = toCsv([{ v: "a,b" }], [{ key: "v", label: "V", value: (r) => r.v }]);
    expect(csv).toBe('V\r\n"a,b"');
  });

  it("quotes and doubles embedded quotes", () => {
    const csv = toCsv([{ v: 'say "hi"' }], [{ key: "v", label: "V", value: (r) => r.v }]);
    expect(csv).toBe('V\r\n"say ""hi"""');
  });

  it("quotes fields containing newlines", () => {
    const csv = toCsv([{ v: "line1\nline2" }], [{ key: "v", label: "V", value: (r) => r.v }]);
    expect(csv).toBe('V\r\n"line1\nline2"');
  });

  it("renders null/undefined values as empty strings", () => {
    const csv = toCsv(
      [{ v: null }, { v: undefined }],
      [{ key: "v", label: "V", value: (r: { v: unknown }) => r.v as string | null }],
    );
    expect(csv).toBe("V\r\n\r\n");
  });

  it("handles zero rows", () => {
    const csv = toCsv([], [{ key: "a", label: "A", value: () => "x" }]);
    expect(csv).toBe("A");
  });
});

describe("buildFleetReportsCsv", () => {
  it("formats fleet reports with fallbacks for null numeric fields", () => {
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
    const csv = buildFleetReportsCsv(reports);
    expect(csv).toContain("Period start,Period end,Average safety score,Total sessions,Total critical alerts");
    expect(csv).toContain("2026-09-01,2026-09-07,,0,0");
  });

  it("formats a report with all fields present", () => {
    const reports: FleetReport[] = [
      {
        id: "r1",
        fleet_id: "f1",
        period_start: "2026-09-01",
        period_end: "2026-09-07",
        avg_safety_score: 88.4,
        total_sessions: 12,
        total_critical_alerts: 2,
        generated_at: "2026-09-08T00:00:00.000Z",
      },
    ];
    const csv = buildFleetReportsCsv(reports);
    expect(csv).toContain("2026-09-01,2026-09-07,88.4,12,2");
  });
});
