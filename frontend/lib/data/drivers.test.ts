import { describe, expect, it } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { buildTestSeed } from "@/lib/data/test-fixtures";
import { getDriverDetail, getDrivers } from "@/lib/data/drivers";

const ref = new Date("2026-09-17T12:00:00.000Z");

describe("getDrivers", () => {
  it("returns an empty array for a fleet with no drivers", async () => {
    const ds = createFakeDataSource(buildTestSeed({ profiles: [] }));
    expect(await getDrivers(ds, "f1", ref)).toEqual([]);
  });

  it("builds a row per driver with derived fields, no sessions", async () => {
    const ds = createFakeDataSource(buildTestSeed());
    const rows = await getDrivers(ds, "f1", ref);
    expect(rows).toHaveLength(2);
    expect(rows[0].currentScore).toBeNull();
    expect(rows[0].scoreBand).toBeNull();
    expect(rows[0].totalVerifiedTrips).toBe(0);
    expect(rows[0].lastActive).toBeNull();
    expect(rows[0].alertCount).toBe(0);
    expect(rows[0].isActive).toBe(false);
  });

  it("prefers the active session's score, counts verified trips and alerts", async () => {
    const seed = buildTestSeed({
      sessions: [
        { id: "s1", driver_id: "d1", device_id: null, fleet_id: "f1", start_time: "2026-09-10T08:00:00.000Z", end_time: "2026-09-10T09:00:00.000Z", start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 5, gps_trace_hash: null, status: "verified", safety_score: 60, created_at: "" },
        { id: "s2", driver_id: "d1", device_id: null, fleet_id: "f1", start_time: "2026-09-17T08:00:00.000Z", end_time: null, start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 5, gps_trace_hash: null, status: "active", safety_score: 85, created_at: "" },
      ],
      events: [
        { id: "e1", session_id: "s1", event_type: "yawn", severity: "soft", device_confidence: 0.5, occurred_at: "2026-09-10T08:30:00.000Z", lat: null, lng: null },
      ],
    });
    const ds = createFakeDataSource(seed);
    const rows = await getDrivers(ds, "f1", ref);
    const d1 = rows.find((r) => r.driver.id === "d1")!;
    expect(d1.currentScore).toBe(85);
    expect(d1.scoreBand).toBe("good");
    expect(d1.totalVerifiedTrips).toBe(1);
    expect(d1.alertCount).toBe(1);
    expect(d1.isActive).toBe(true);
    expect(d1.lastActive).toBe("2026-09-17T08:00:00.000Z");
  });

  it("falls back to the most recent session's score when no session is active", async () => {
    const seed = buildTestSeed({
      sessions: [
        { id: "s1", driver_id: "d1", device_id: null, fleet_id: "f1", start_time: "2026-09-10T08:00:00.000Z", end_time: "2026-09-10T09:00:00.000Z", start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 5, gps_trace_hash: null, status: "verified", safety_score: 60, created_at: "" },
      ],
    });
    const ds = createFakeDataSource(seed);
    const rows = await getDrivers(ds, "f1", ref);
    const d1 = rows.find((r) => r.driver.id === "d1")!;
    expect(d1.currentScore).toBe(60);
    expect(d1.isActive).toBe(false);
  });
});

describe("getDriverDetail", () => {
  it("returns null when the driver does not exist", async () => {
    const ds = createFakeDataSource(buildTestSeed({ profiles: [] }));
    expect(await getDriverDetail(ds, "missing")).toBeNull();
  });

  it("returns driver, sessions, events, and rewards when found", async () => {
    const seed = buildTestSeed({
      sessions: [
        { id: "s1", driver_id: "d1", device_id: null, fleet_id: "f1", start_time: "2026-09-10T08:00:00.000Z", end_time: "2026-09-10T09:00:00.000Z", start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 5, gps_trace_hash: null, status: "verified", safety_score: 60, created_at: "" },
      ],
      events: [
        { id: "e1", session_id: "s1", event_type: "yawn", severity: "soft", device_confidence: 0.5, occurred_at: "2026-09-10T08:30:00.000Z", lat: null, lng: null },
      ],
      rewards: [
        { id: "r1", driver_id: "d1", session_id: "s1", points_earned: 10, token_amount: 1, status: "settled", stacks_tx_hash: null, created_at: "" },
      ],
    });
    const ds = createFakeDataSource(seed);
    const detail = await getDriverDetail(ds, "d1");
    expect(detail?.driver.id).toBe("d1");
    expect(detail?.sessions).toHaveLength(1);
    expect(detail?.events).toHaveLength(1);
    expect(detail?.rewards).toHaveLength(1);
  });

  it("returns an empty events array when the driver has no sessions", async () => {
    const ds = createFakeDataSource(buildTestSeed());
    const detail = await getDriverDetail(ds, "d1");
    expect(detail?.events).toEqual([]);
  });
});
