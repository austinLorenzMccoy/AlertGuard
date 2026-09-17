import type { DriverListRow, ScoreBand } from "@/lib/types";

export type DriverSortKey = "name" | "score" | "trips" | "lastActive" | "alerts";
export type SortDirection = "asc" | "desc";

export interface DriverListFilters {
  scoreBand?: ScoreBand | "all";
  activeOnly?: boolean;
  minAlerts?: number;
}

/** Sort/filter logic for the driver list (PRD Section 8.3). */
export function sortDrivers(
  rows: DriverListRow[],
  key: DriverSortKey,
  direction: SortDirection = "asc",
): DriverListRow[] {
  const sorted = [...rows].sort((a, b) => compare(a, b, key));
  if (direction === "desc") sorted.reverse();
  return sorted;
}

function compare(a: DriverListRow, b: DriverListRow, key: DriverSortKey): number {
  switch (key) {
    case "name":
      return (a.driver.full_name ?? "").localeCompare(b.driver.full_name ?? "");
    case "score":
      return (a.currentScore ?? -1) - (b.currentScore ?? -1);
    case "trips":
      return a.totalVerifiedTrips - b.totalVerifiedTrips;
    case "alerts":
      return a.alertCount - b.alertCount;
    case "lastActive":
    default:
      return (a.lastActive ?? "").localeCompare(b.lastActive ?? "");
  }
}

export function filterDrivers(
  rows: DriverListRow[],
  filters: DriverListFilters,
): DriverListRow[] {
  return rows.filter((row) => {
    if (
      filters.scoreBand &&
      filters.scoreBand !== "all" &&
      row.scoreBand !== filters.scoreBand
    ) {
      return false;
    }
    if (filters.activeOnly && !row.isActive) return false;
    if (filters.minAlerts !== undefined && row.alertCount < filters.minAlerts) {
      return false;
    }
    return true;
  });
}
