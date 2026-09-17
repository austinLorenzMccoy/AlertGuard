import { describe, expect, it } from "vitest";
import { createFakeDataSource, type FakeSeed } from "@/lib/data/fake-data-source";

const seed: FakeSeed = {
  fleets: [{ id: "f1", name: "Fleet One", owner_id: "m1", created_at: "" }],
  profiles: [
    { id: "d1", full_name: "Driver One", phone: "1", role: "driver", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
    { id: "d2", full_name: "Driver Two", phone: "2", role: "driver", fleet_id: "f2", wallet_address: null, created_at: "", updated_at: "" },
    { id: "m1", full_name: "Manager", phone: "3", role: "fleet_manager", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
  ],
  devices: [{ id: "dev1", driver_id: "d1", device_model: null, os_version: null, app_version: null, device_attestation_key: null, last_active: "" }],
  sessions: [
    { id: "s1", driver_id: "d1", device_id: "dev1", fleet_id: "f1", start_time: "2026-09-01", end_time: null, start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 1, gps_trace_hash: null, status: "active", safety_score: 80, created_at: "" },
    { id: "s2", driver_id: "d2", device_id: null, fleet_id: "f2", start_time: "2026-09-01", end_time: null, start_lat: null, start_lng: null, end_lat: null, end_lng: null, distance_km: 1, gps_trace_hash: null, status: "verified", safety_score: 60, created_at: "" },
  ],
  events: [
    { id: "e1", session_id: "s1", event_type: "eye_closure", severity: "critical", device_confidence: 0.9, occurred_at: "2026-09-01T00:00:00.000Z", lat: null, lng: null },
    { id: "e2", session_id: "s2", event_type: "yawn", severity: "soft", device_confidence: 0.5, occurred_at: "2026-09-01T00:00:00.000Z", lat: null, lng: null },
  ],
  rewards: [{ id: "r1", driver_id: "d1", session_id: "s1", points_earned: 10, token_amount: 1, status: "settled", stacks_tx_hash: null, created_at: "" }],
  redemptions: [
    { id: "rd1", driver_id: "d1", redemption_type: "airtime", amount: 100, status: "pending", created_at: "" },
    { id: "rd2", driver_id: "d2", redemption_type: "airtime", amount: 100, status: "completed", created_at: "" },
  ],
  reports: [{ id: "rep1", fleet_id: "f1", period_start: "2026-09-01", period_end: "2026-09-07", avg_safety_score: 80, total_sessions: 1, total_critical_alerts: 1, generated_at: "" }],
};

describe("createFakeDataSource", () => {
  const ds = createFakeDataSource(seed);

  it("getProfiles: no filter returns all", async () => {
    expect(await ds.getProfiles()).toHaveLength(3);
  });
  it("getProfiles: filters by fleet_id", async () => {
    expect(await ds.getProfiles({ fleet_id: "f1" })).toHaveLength(2);
  });
  it("getProfiles: filters by role", async () => {
    expect(await ds.getProfiles({ role: "fleet_manager" })).toHaveLength(1);
  });
  it("getProfiles: filters by id", async () => {
    expect(await ds.getProfiles({ id: "d1" })).toHaveLength(1);
  });

  it("getFleets: no filter returns all, filters by id", async () => {
    expect(await ds.getFleets()).toHaveLength(1);
    expect(await ds.getFleets({ id: "f1" })).toHaveLength(1);
    expect(await ds.getFleets({ id: "missing" })).toHaveLength(0);
  });

  it("getDevices: no filter and filtered by driver_id", async () => {
    expect(await ds.getDevices()).toHaveLength(1);
    expect(await ds.getDevices({ driver_id: "d1" })).toHaveLength(1);
    expect(await ds.getDevices({ driver_id: "nope" })).toHaveLength(0);
  });

  it("getDrivingSessions: filters by fleet_id, driver_id, status", async () => {
    expect(await ds.getDrivingSessions()).toHaveLength(2);
    expect(await ds.getDrivingSessions({ fleet_id: "f1" })).toHaveLength(1);
    expect(await ds.getDrivingSessions({ driver_id: "d2" })).toHaveLength(1);
    expect(await ds.getDrivingSessions({ status: "verified" })).toHaveLength(1);
  });

  it("getDrowsinessEvents: filters by session_id, session_ids, severity", async () => {
    expect(await ds.getDrowsinessEvents()).toHaveLength(2);
    expect(await ds.getDrowsinessEvents({ session_id: "s1" })).toHaveLength(1);
    expect(await ds.getDrowsinessEvents({ session_ids: ["s1"] })).toHaveLength(1);
    expect(await ds.getDrowsinessEvents({ severity: "critical" })).toHaveLength(1);
  });

  it("getRewards: no filter and filtered by driver_id", async () => {
    expect(await ds.getRewards()).toHaveLength(1);
    expect(await ds.getRewards({ driver_id: "d1" })).toHaveLength(1);
    expect(await ds.getRewards({ driver_id: "nope" })).toHaveLength(0);
  });

  it("getRedemptions: filters by driver_id and status", async () => {
    expect(await ds.getRedemptions()).toHaveLength(2);
    expect(await ds.getRedemptions({ driver_id: "d1" })).toHaveLength(1);
    expect(await ds.getRedemptions({ status: "completed" })).toHaveLength(1);
  });

  it("getFleetReports: no filter and filtered by fleet_id", async () => {
    expect(await ds.getFleetReports()).toHaveLength(1);
    expect(await ds.getFleetReports({ fleet_id: "f1" })).toHaveLength(1);
    expect(await ds.getFleetReports({ fleet_id: "missing" })).toHaveLength(0);
  });
});
