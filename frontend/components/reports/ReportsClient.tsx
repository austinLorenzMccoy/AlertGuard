"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateRangePicker } from "@/components/reports/DateRangePicker";
import { downloadFile } from "@/lib/dom/download";
import { buildFleetReportsCsv } from "@/lib/logic/csv-export";
import { jsonStubPdfRenderer, shapeFleetReportForPdf } from "@/lib/logic/pdf-export";
import { filterReportsInRange, resolveReportRange, type ReportPreset } from "@/lib/logic/report-query";
import type { Fleet, FleetReport } from "@/lib/types";

export interface ReportsClientProps {
  fleet: Fleet | null;
  reports: FleetReport[];
}

/** Reports & export screen (PRD Section 8.6). */
export function ReportsClient({ fleet, reports }: ReportsClientProps) {
  const [preset, setPreset] = useState<ReportPreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const visibleReports = useMemo(() => {
    if (preset === "custom" && (!customStart || !customEnd)) return [];
    const range = resolveReportRange(
      preset,
      preset === "custom" ? { start: new Date(customStart), end: new Date(customEnd) } : undefined,
    );
    return filterReportsInRange(reports, range);
  }, [preset, customStart, customEnd, reports]);

  const handleExportCsv = () => {
    const csv = buildFleetReportsCsv(visibleReports);
    downloadFile("alertguard-fleet-report.csv", csv, "text/csv");
  };

  const handleExportPdf = () => {
    const doc = shapeFleetReportForPdf(fleet, visibleReports);
    const bytes = jsonStubPdfRenderer.render(doc);
    downloadFile("alertguard-fleet-report.pdf", bytes, "application/pdf");
  };

  return (
    <div className="flex flex-col gap-4">
      <DateRangePicker
        preset={preset}
        customStart={customStart}
        customEnd={customEnd}
        onPresetChange={setPreset}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
      />
      <div className="flex gap-2">
        <Button variant="secondary" onClick={handleExportCsv} disabled={visibleReports.length === 0}>
          Export CSV
        </Button>
        <Button variant="secondary" onClick={handleExportPdf} disabled={visibleReports.length === 0}>
          Export PDF
        </Button>
      </div>
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-mist">
            <th scope="col" className="pb-2 pr-4 font-medium">Period</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Avg score</th>
            <th scope="col" className="pb-2 pr-4 font-medium">Sessions</th>
            <th scope="col" className="pb-2 font-medium">Critical alerts</th>
          </tr>
        </thead>
        <tbody>
          {visibleReports.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-mist">
                No report periods in this range.
              </td>
            </tr>
          )}
          {visibleReports.map((r) => (
            <tr key={r.id} className="border-b border-line/60 text-fog">
              <td className="py-3 pr-4">{r.period_start} – {r.period_end}</td>
              <td className="py-3 pr-4">{r.avg_safety_score ?? "—"}</td>
              <td className="py-3 pr-4">{r.total_sessions ?? 0}</td>
              <td className="py-3">{r.total_critical_alerts ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
