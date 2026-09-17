import { describe, expect, it } from "vitest";
import { countRedemptionsByStatus, filterRedemptionsByStatus } from "@/lib/logic/redemptions-filter";
import type { Redemption } from "@/lib/types";

function redemption(overrides: Partial<Redemption>): Redemption {
  return {
    id: "r1",
    driver_id: "d1",
    redemption_type: "airtime",
    amount: 500,
    status: "pending",
    created_at: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

const redemptions: Redemption[] = [
  redemption({ id: "1", status: "pending" }),
  redemption({ id: "2", status: "processing" }),
  redemption({ id: "3", status: "completed" }),
  redemption({ id: "4", status: "failed" }),
  redemption({ id: "5", status: "pending" }),
];

describe("filterRedemptionsByStatus", () => {
  it("returns everything for 'all'", () => {
    expect(filterRedemptionsByStatus(redemptions, "all")).toHaveLength(5);
  });

  it("filters to a single status", () => {
    const filtered = filterRedemptionsByStatus(redemptions, "pending");
    expect(filtered.map((r) => r.id)).toEqual(["1", "5"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterRedemptionsByStatus([], "completed")).toEqual([]);
  });
});

describe("countRedemptionsByStatus", () => {
  it("counts each status bucket, including zero counts", () => {
    expect(countRedemptionsByStatus(redemptions)).toEqual({
      pending: 2,
      processing: 1,
      completed: 1,
      failed: 1,
    });
  });

  it("returns all zeros for an empty list", () => {
    expect(countRedemptionsByStatus([])).toEqual({
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    });
  });
});
