import Link from "next/link";
import { ScoreBar } from "@/components/ui/ScoreBar";
import { Sparkline } from "@/components/ui/Sparkline";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { DriverSortKey, SortDirection } from "@/lib/logic/driver-list";
import type { DriverListRow } from "@/lib/types";

export interface DriverTableProps {
  rows: DriverListRow[];
  sortKey: DriverSortKey;
  sortDirection: SortDirection;
  onSort: (key: DriverSortKey) => void;
}

const COLUMNS: { key: DriverSortKey; label: string }[] = [
  { key: "name", label: "Driver" },
  { key: "score", label: "Score" },
  { key: "trips", label: "Verified trips" },
  { key: "alerts", label: "Alerts" },
  { key: "lastActive", label: "Last active" },
];

/** Driver list table (PRD Section 8.3): sortable columns, row click -> driver detail. */
export function DriverTable({ rows, sortKey, sortDirection, onSort }: DriverTableProps) {
  return (
    <table className="w-full border-collapse text-left text-sm">
      <thead>
        <tr className="border-b border-line text-xs text-mist">
          {COLUMNS.map((col) => (
            <th key={col.key} scope="col" className="pb-2 pr-4 font-medium">
              <button
                type="button"
                onClick={() => onSort(col.key)}
                className="flex min-h-touch items-center gap-1 text-mist hover:text-fog"
                aria-label={`Sort by ${col.label}`}
              >
                {col.label}
                {sortKey === col.key && (
                  <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>
                )}
              </button>
            </th>
          ))}
          <th scope="col" className="pb-2 font-medium">
            7-day trend
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={COLUMNS.length + 1} className="py-6 text-center text-mist">
              No drivers match the current filters.
            </td>
          </tr>
        )}
        {rows.map((row) => (
          <tr key={row.driver.id} className="border-b border-line/60">
            <td className="py-3 pr-4">
              <Link href={`/drivers/${row.driver.id}`} className="font-medium text-fog hover:text-accent">
                {row.driver.full_name ?? "Unnamed driver"}
              </Link>
            </td>
            <td className="py-3 pr-4">
              <div className="flex items-center gap-2">
                <ScoreBar score={row.currentScore} />
                <StatusBadge band={row.scoreBand} />
              </div>
            </td>
            <td className="py-3 pr-4 text-fog">{row.totalVerifiedTrips}</td>
            <td className="py-3 pr-4 text-fog">{row.alertCount}</td>
            <td className="py-3 pr-4 text-fog">
              {row.lastActive ? new Date(row.lastActive).toLocaleDateString() : "—"}
            </td>
            <td className="py-3">
              <Sparkline points={row.sevenDayTrend} label={`${row.driver.full_name ?? "Driver"} 7-day trend`} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
