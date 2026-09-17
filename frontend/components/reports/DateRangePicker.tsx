import type { ReportPreset } from "@/lib/logic/report-query";

export interface DateRangePickerProps {
  preset: ReportPreset;
  customStart: string;
  customEnd: string;
  onPresetChange: (preset: ReportPreset) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}

const PRESETS: { value: ReportPreset; label: string }[] = [
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
  { value: "custom", label: "Custom range" },
];

/** Date-range picker for Reports & export (PRD Section 8.6). */
export function DateRangePicker({
  preset,
  customStart,
  customEnd,
  onPresetChange,
  onCustomStartChange,
  onCustomEndChange,
}: DateRangePickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-sm text-mist" htmlFor="report-preset">
        Range
        <select
          id="report-preset"
          value={preset}
          onChange={(e) => onPresetChange(e.target.value as ReportPreset)}
          className="min-h-touch rounded-btn border border-line bg-ink-3 px-2 text-fog"
        >
          {PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {preset === "custom" && (
        <>
          <label className="flex items-center gap-2 text-sm text-mist" htmlFor="report-start">
            From
            <input
              id="report-start"
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="min-h-touch rounded-btn border border-line bg-ink-3 px-2 text-fog"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-mist" htmlFor="report-end">
            To
            <input
              id="report-end"
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="min-h-touch rounded-btn border border-line bg-ink-3 px-2 text-fog"
            />
          </label>
        </>
      )}
    </div>
  );
}
