import { describe, expect, it } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { buildTestSeed } from "@/lib/data/test-fixtures";
import { getRedemptions } from "@/lib/data/redemptions";

describe("getRedemptions", () => {
  it("returns an empty array when the fleet has no drivers", async () => {
    const ds = createFakeDataSource(buildTestSeed({ profiles: [] }));
    expect(await getRedemptions(ds, "f1")).toEqual([]);
  });

  it("enriches redemptions with driver name, newest first", async () => {
    const seed = buildTestSeed({
      redemptions: [
        { id: "rd1", driver_id: "d1", redemption_type: "airtime", amount: 500, status: "pending", created_at: "2026-09-01T00:00:00.000Z" },
        { id: "rd2", driver_id: "d2", redemption_type: "fuel_voucher", amount: 1000, status: "completed", created_at: "2026-09-05T00:00:00.000Z" },
      ],
    });
    const ds = createFakeDataSource(seed);
    const rows = await getRedemptions(ds, "f1");
    expect(rows.map((r) => r.redemption.id)).toEqual(["rd2", "rd1"]);
    expect(rows[0].driverName).toBe("Driver Two");
  });

  it("falls back to 'Unknown driver' when the driver profile is missing", async () => {
    const seed = buildTestSeed({
      profiles: [
        { id: "d1", full_name: null, phone: null, role: "driver", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
      ],
      redemptions: [
        { id: "rd1", driver_id: "d1", redemption_type: "airtime", amount: 500, status: "pending", created_at: "" },
      ],
    });
    const ds = createFakeDataSource(seed);
    const rows = await getRedemptions(ds, "f1");
    expect(rows[0].driverName).toBe("Unknown driver");
  });
});
