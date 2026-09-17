import type { Redemption, RedemptionStatus } from "@/lib/types";

export type RedemptionStatusFilter = RedemptionStatus | "all";

/** Redemption status table filtering (PRD Section 8.7). */
export function filterRedemptionsByStatus(
  redemptions: Redemption[],
  status: RedemptionStatusFilter,
): Redemption[] {
  if (status === "all") return redemptions;
  return redemptions.filter((r) => r.status === status);
}

export function countRedemptionsByStatus(
  redemptions: Redemption[],
): Record<RedemptionStatus, number> {
  const counts: Record<RedemptionStatus, number> = {
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  };
  for (const r of redemptions) {
    counts[r.status] += 1;
  }
  return counts;
}
