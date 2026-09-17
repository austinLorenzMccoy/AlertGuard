import { describe, expect, it } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { buildTestSeed } from "@/lib/data/test-fixtures";
import { getFleetOverview } from "@/lib/data/overview";

const ref = new Date("2026-09-17T12:00:00.000Z");

describe("getFleetOverview", () => {
  it("returns a neutral snapshot for a fleet with no drivers/sessions/events", async () => {
    const ds = createFakeDataSource(buildTestSeed({ profiles: [], sessions: [] }));
    const data = await getFleetOverview(ds, "f1", ref);
    expect(data.fleet?.name).toBe("Fleet One");
    expect(data.activeDriversNow).toBe(0);
    expect(data.todayAvgScore).toBeNull();
    expect(data.todayCriticalAlertCount).toBe(0);
    expect(data.driverCards).toEqual([]);
  });

  it("returns null fleet when no fleet matches", async () => {
    const ds = createFakeDataSource(buildTestSeed({ fleets: [] }));
    const data = await getFleetOverview(ds, "f1", ref);
    expect(data.fleet).toBeNull();
  });

  it("counts active drivers and averages today's scored sessions", async () => {
    const seed = buildTestSeed({
      sessions: [
        { id: "s1", driver_id: "d1", device_id: null, fleet_id: "f1", start_time: "2026-09-17T08:00:00.000Z", end_time: null, start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 5, gps_trace_hash: null, status: "active", safety_score: 90, created_at: "" },
        { id: "s2", driver_id: "d2", device_id: null, fleet_id: "f1", start_time: "2026-09-17T09:00:00.000Z", end_time: "2026-09-17T10:00:00.000Z", start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 5, gps_trace_hash: null, status: "verified", safety_score: 70, created_at: "" },
        { id: "s3", driver_id: "d1", device_id: null, fleet_id: "f1", start_time: "2026-09-10T08:00:00.000Z", end_time: "2026-09-10T09:00:00.000Z", start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 5, gps_trace_hash: null, status: "verified", safety_score: 50, created_at: "" },
      ],
      events: [
        { id: "e1", session_id: "s1", event_type: "eye_closure", severity: "critical", device_confidence: 0.9, occurred_at: "2026-09-17T08:30:00.000Z", lat: null, lng: null },
        { id: "e2", session_id: "s3", event_type: "head_nod", severity: "critical", device_confidence: 0.9, occurred_at: "2026-09-10T08:30:00.000Z", lat: null, lng: null },
      ],
    });
    const ds = createFakeDataSource(seed);
    const data = await getFleetOverview(ds, "f1", ref);

    expect(data.activeDriversNow).toBe(1);
    expect(data.todayAvgScore).toBe(80); // avg of s1 (90) and s2 (70)
    expect(data.todayCriticalAlertCount).toBe(1); // only e1 is today's session

    const d1Card = data.driverCards.find((c) => c.driver.id === "d1")!;
    expect(d1Card.isLive).toBe(true);
    expect(d1Card.currentScore).toBe(90);

    const d2Card = data.driverCards.find((c) => c.driver.id === "d2")!;
    expect(d2Card.isLive).toBe(false);
    expect(d2Card.currentScore).toBe(70);
  });

  it("falls back to null currentScore when a driver has no sessions at all", async () => {
    const ds = createFakeDataSource(buildTestSeed());
    const data = await getFleetOverview(ds, "f1", ref);
    expect(data.driverCards.every((c) => c.currentScore === null)).toBe(true);
  });
});
