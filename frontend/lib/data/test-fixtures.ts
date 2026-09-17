import type { FakeSeed } from "@/lib/data/fake-data-source";

/**
 * Shared fixture builder for lib/data/*.test.ts. Not a fixed constant like
 * demo-seed.ts — returns a fresh object each call and accepts overrides so
 * individual tests can shape scenarios (empty fleet, no active sessions, etc).
 */
export function buildTestSeed(overrides: Partial<FakeSeed> = {}): FakeSeed {
  return {
    fleets: [{ id: "f1", name: "Fleet One", owner_id: "m1", created_at: "2026-01-01T00:00:00.000Z" }],
    profiles: [
      { id: "d1", full_name: "Driver One", phone: "+2348010000001", role: "driver", fleet_id: "f1", wallet_address: null, created_at: "", updated_at: "" },
      { id: "d2", full_name: "Driver Two", phone: "+2348010000002", role: "driver", fleet_id: "f1", wallet_address: "SP1...", created_at: "", updated_at: "" },
    ],
    devices: [],
    sessions: [],
    events: [],
    rewards: [],
    redemptions: [],
    reports: [],
    ...overrides,
  };
}
