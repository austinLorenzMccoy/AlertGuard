"use client";

import { useMemo, useState } from "react";
import { DriverTable } from "@/components/drivers/DriverTable";
import {
  filterDrivers,
  sortDrivers,
  type DriverListFilters,
  type DriverSortKey,
  type SortDirection,
} from "@/lib/logic/driver-list";
import type { DriverListRow, ScoreBand } from "@/lib/types";

export interface DriverListClientProps {
  rows: DriverListRow[];
}

const SCORE_BAND_OPTIONS: { value: ScoreBand | "all"; label: string }[] = [
  { value: "all", label: "All bands" },
  { value: "good", label: "Good" },
  { value: "warning", label: "Warning" },
  { value: "critical", label: "Critical" },
];

/** Driver list screen (PRD Section 8.3): owns sort/filter state, delegates rendering. */
export function DriverListClient({ rows }: DriverListClientProps) {
  const [sortKey, setSortKey] = useState<DriverSortKey>("score");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [filters, setFilters] = useState<DriverListFilters>({ scoreBand: "all", activeOnly: false });

  const handleSort = (key: DriverSortKey) => {
    if (key === sortKey) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  };

  const visibleRows = useMemo(() => {
    const filtered = filterDrivers(rows, filters);
    return sortDrivers(filtered, sortKey, sortDirection);
  }, [rows, filters, sortKey, sortDirection]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-mist" htmlFor="score-band-filter">
          Score band
          <select
            id="score-band-filter"
            value={filters.scoreBand}
            onChange={(e) =>
              setFilters((f) => ({ ...f, scoreBand: e.target.value as ScoreBand | "all" }))
            }
            className="min-h-touch rounded-btn border border-line bg-ink-3 px-2 text-fog"
          >
            {SCORE_BAND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-touch items-center gap-2 text-sm text-mist">
          <input
            type="checkbox"
            checked={filters.activeOnly === true}
            onChange={(e) => setFilters((f) => ({ ...f, activeOnly: e.target.checked }))}
            className="h-4 w-4"
          />
          Active trip only
        </label>
      </div>
      <DriverTable rows={visibleRows} sortKey={sortKey} sortDirection={sortDirection} onSort={handleSort} />
    </div>
  );
}
