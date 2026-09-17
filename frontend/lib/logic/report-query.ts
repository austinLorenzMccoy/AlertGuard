import type { FleetReport } from "@/lib/types";

export type ReportPreset = "this_week" | "this_month" | "custom";

export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * Resolves a report-range preset into a concrete {start, end} date range
 * (PRD Section 8.6: "Date-range picker -> pulls from fleet_reports").
 * `custom` requires an explicit range to be supplied; throws otherwise so
 * a caller can't silently query the wrong window.
 */
export function resolveReportRange(
  preset: ReportPreset,
  customRange: DateRange | undefined,
  now: Date = new Date(),
): DateRange {
  if (preset === "custom") {
    if (!customRange) {
      throw new Error("customRange is required when preset is 'custom'");
    }
    return customRange;
  }

  const end = new Date(now);
  const start = new Date(now);

  if (preset === "this_week") {
    start.setDate(start.getDate() - 7);
  } else {
    start.setMonth(start.getMonth() - 1);
  }

  return { start, end };
}

/**
 * Filters pre-computed `fleet_reports` rows whose period overlaps the given
 * range. If no rows overlap, the caller should trigger on-demand aggregation
 * (PRD Section 8.6) — this function only does the filtering half.
 */
export function filterReportsInRange(
  reports: FleetReport[],
  range: DateRange,
): FleetReport[] {
  const startKey = toDateKey(range.start);
  const endKey = toDateKey(range.end);
  return reports.filter((r) => r.period_end >= startKey && r.period_start <= endKey);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}
