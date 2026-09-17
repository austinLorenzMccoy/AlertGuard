import type { FleetReport } from "@/lib/types";

export interface CsvColumn<T> {
  key: string;
  label: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Generic, RFC-4180-ish CSV formatter: quotes a field only when it contains
 * a comma, quote, or newline, and doubles embedded quotes. Shared by every
 * export in Section 8.6.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.label)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(c.value(row))).join(","),
  );
  return [header, ...lines].join("\r\n");
}

function escapeCsvField(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? "" : String(value);
  const needsQuoting = /[",\r\n]/.test(str);
  if (!needsQuoting) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

const REPORT_COLUMNS: CsvColumn<FleetReport>[] = [
  { key: "period_start", label: "Period start", value: (r) => r.period_start },
  { key: "period_end", label: "Period end", value: (r) => r.period_end },
  {
    key: "avg_safety_score",
    label: "Average safety score",
    value: (r) => r.avg_safety_score ?? "",
  },
  { key: "total_sessions", label: "Total sessions", value: (r) => r.total_sessions ?? 0 },
  {
    key: "total_critical_alerts",
    label: "Total critical alerts",
    value: (r) => r.total_critical_alerts ?? 0,
  },
];

/** Raw fleet-report export for insurers (PRD Section 8.6, "Export as CSV (raw)"). */
export function buildFleetReportsCsv(reports: FleetReport[]): string {
  return toCsv(reports, REPORT_COLUMNS);
}
