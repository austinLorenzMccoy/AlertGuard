import { describe, expect, it } from "vitest";
import { createFakeDataSource } from "@/lib/data/fake-data-source";
import { buildTestSeed } from "@/lib/data/test-fixtures";
import { buildDriverInfoBySessionId, getLiveAlerts } from "@/lib/data/alerts";

describe("buildDriverInfoBySessionId", () => {
  it("maps session id to driver id/name", () => {
    const sessions = [{ id: "s1", driver_id: "d1" }];
    const drivers = [
      { id: "d1", full_name: "Ada", phone: null, role: "driver" as const, fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
    ];
    const lookup = buildDriverInfoBySessionId(sessions, drivers);
    expect(lookup.s1).toEqual({ driverId: "d1", driverName: "Ada" });
  });

  it("falls back to 'Unknown driver' when the driver profile is missing", () => {
    const sessions = [{ id: "s1", driver_id: "ghost" }];
    const lookup = buildDriverInfoBySessionId(sessions, []);
    expect(lookup.s1).toEqual({ driverId: "ghost", driverName: "Unknown driver" });
  });
});

describe("getLiveAlerts", () => {
  it("returns an empty array when there are no critical events", async () => {
    const ds = createFakeDataSource(buildTestSeed());
    expect(await getLiveAlerts(ds, "f1")).toEqual([]);
  });

  it("enriches critical events with driver name, newest first, capped at limit", async () => {
    const seed = buildTestSeed({
      sessions: [
        { id: "s1", driver_id: "d1", device_id: null, fleet_id: "f1", start_time: "2026-09-01", end_time: null, start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 1, gps_trace_hash: null, status: "active", safety_score: 50, created_at: "" },
        { id: "s2", driver_id: "d2", device_id: null, fleet_id: "f1", start_time: "2026-09-01", end_time: null, start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 1, gps_trace_hash: null, status: "active", safety_score: 50, created_at: "" },
      ],
      events: [
        { id: "e1", session_id: "s1", event_type: "eye_closure", severity: "critical", device_confidence: 0.9, occurred_at: "2026-09-01T08:00:00.000Z", lat: null, lng: null },
        { id: "e2", session_id: "s2", event_type: "head_nod", severity: "critical", device_confidence: 0.9, occurred_at: "2026-09-01T09:00:00.000Z", lat: null, lng: null },
        { id: "e3", session_id: "s1", event_type: "yawn", severity: "soft", device_confidence: 0.5, occurred_at: "2026-09-01T09:30:00.000Z", lat: null, lng: null },
      ],
    });
    const ds = createFakeDataSource(seed);
    const rows = await getLiveAlerts(ds, "f1", 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].event.id).toBe("e2");
    expect(rows[0].driverName).toBe("Driver Two");
  });

  it("excludes critical events whose session no longer exists", async () => {
    const seed = buildTestSeed({
      events: [
        { id: "e1", session_id: "orphan", event_type: "eye_closure", severity: "critical", device_confidence: 0.9, occurred_at: "2026-09-01T08:00:00.000Z", lat: null, lng: null },
      ],
    });
    const ds = createFakeDataSource(seed);
    expect(await getLiveAlerts(ds, "f1")).toEqual([]);
  });
});
