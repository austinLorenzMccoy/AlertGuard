"use client";

import { useMemo, useState } from "react";
import { RedemptionsTable, type RedemptionsTableRow } from "@/components/redemptions/RedemptionsTable";
import {
  countRedemptionsByStatus,
  filterRedemptionsByStatus,
  type RedemptionStatusFilter,
} from "@/lib/logic/redemptions-filter";
import type { Redemption } from "@/lib/types";

export interface RedemptionsClientProps {
  initialRows: RedemptionsTableRow[];
}

const STATUS_TABS: { value: RedemptionStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

/** Redemptions admin screen (PRD Section 8.7): status filter + manual-approval toggle. */
export function RedemptionsClient({ initialRows }: RedemptionsClientProps) {
  const [rows, setRows] = useState<RedemptionsTableRow[]>(initialRows);
  const [statusFilter, setStatusFilter] = useState<RedemptionStatusFilter>("all");
  const [manualApproval, setManualApproval] = useState(false);

  const redemptions = rows.map((r) => r.redemption);
  const counts = countRedemptionsByStatus(redemptions);

  const visibleRedemptionIds = useMemo(() => {
    const filtered = filterRedemptionsByStatus(redemptions, statusFilter);
    return new Set(filtered.map((r) => r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redemptions, statusFilter]);

  const visibleRows = rows.filter((r) => visibleRedemptionIds.has(r.redemption.id));

  const setStatus = (id: string, status: Redemption["status"]) => {
    setRows((prev) =>
      prev.map((r) => (r.redemption.id === id ? { ...r, redemption: { ...r.redemption, status } } : r)),
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-touch items-center gap-2 text-sm text-mist">
        <input
          type="checkbox"
          checked={manualApproval}
          onChange={(e) => setManualApproval(e.target.checked)}
          className="h-4 w-4"
        />
        Require manual approval for redemptions on this fleet
      </label>
      <div role="tablist" aria-label="Filter redemptions by status" className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={statusFilter === tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`min-h-touch rounded-btn border px-3 text-sm ${
              statusFilter === tab.value
                ? "border-accent text-accent"
                : "border-line text-mist hover:text-fog"
            }`}
          >
            {tab.label}
            {tab.value !== "all" && ` (${counts[tab.value]})`}
          </button>
        ))}
      </div>
      <RedemptionsTable
        rows={visibleRows}
        onApprove={(id) => setStatus(id, manualApproval ? "processing" : "completed")}
        onReject={(id) => setStatus(id, "failed")}
      />
    </div>
  );
}
