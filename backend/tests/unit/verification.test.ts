import { describe, it, expect } from "vitest";
import {
  checkGpsContinuity,
  checkDeviceAttestation,
  checkTimestampConsistency,
  verifySession,
  haversineDistanceKm,
} from "../../supabase/functions/_shared/verification.ts";
import type { DrivingSessionRow, DeviceRow } from "../../supabase/functions/_shared/types.ts";

function baseSession(overrides: Partial<DrivingSessionRow> = {}): DrivingSessionRow {
  return {
    id: "session-1",
    driver_id: "driver-1",
    device_id: "device-1",
    fleet_id: "fleet-1",
    start_time: "2026-01-01T08:00:00.000Z",
    end_time: "2026-01-01T08:30:00.000Z", // 30 minutes
    start_lat: 6.5244,
    start_lng: 3.3792, // Lagos
    end_lat: 6.4550,
    end_lng: 3.3841, // ~7.7km south, plausible in 30 min
    distance_km: 9,
    gps_trace_hash: "hash",
    status: "completed",
    safety_score: null,
    created_at: "2026-01-01T08:00:00.000Z",
    ...overrides,
  };
}

const fixedNow = () => new Date("2026-01-01T09:00:00.000Z");

describe("haversineDistanceKm", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceKm(6.5, 3.3, 6.5, 3.3)).toBeCloseTo(0, 5);
  });

  it("computes a plausible distance between two known points", () => {
    const km = haversineDistanceKm(6.5244, 3.3792, 6.4550, 3.3841);
    expect(km).toBeGreaterThan(5);
    expect(km).toBeLessThan(10);
  });
});

describe("checkGpsContinuity", () => {
  it("passes for a plausible trip", () => {
    expect(checkGpsContinuity(baseSession())).toBe(true);
  });

  it("fails when start_lat is missing", () => {
    expect(checkGpsContinuity(baseSession({ start_lat: null }))).toBe(false);
  });

  it("fails when start_lng is missing", () => {
    expect(checkGpsContinuity(baseSession({ start_lng: null }))).toBe(false);
  });

  it("fails when end_lat is missing", () => {
    expect(checkGpsContinuity(baseSession({ end_lat: null }))).toBe(false);
  });

  it("fails when end_lng is missing", () => {
    expect(checkGpsContinuity(baseSession({ end_lng: null }))).toBe(false);
  });

  it("fails for an out-of-range latitude", () => {
    expect(checkGpsContinuity(baseSession({ start_lat: 200 }))).toBe(false);
  });

  it("fails for an out-of-range longitude", () => {
    expect(checkGpsContinuity(baseSession({ end_lng: -200 }))).toBe(false);
  });

  it("fails for a non-finite coordinate", () => {
    expect(checkGpsContinuity(baseSession({ start_lat: NaN }))).toBe(false);
  });

  it("fails when distance_km is missing", () => {
    expect(checkGpsContinuity(baseSession({ distance_km: null }))).toBe(false);
  });

  it("fails when distance_km is negative", () => {
    expect(checkGpsContinuity(baseSession({ distance_km: -1 }))).toBe(false);
  });

  it("fails when start_time is missing", () => {
    expect(checkGpsContinuity(baseSession({ start_time: null }))).toBe(false);
  });

  it("fails when end_time is missing", () => {
    expect(checkGpsContinuity(baseSession({ end_time: null }))).toBe(false);
  });

  it("fails for an unparseable start_time", () => {
    expect(checkGpsContinuity(baseSession({ start_time: "not-a-date" }))).toBe(false);
  });

  it("fails for an unparseable end_time", () => {
    expect(checkGpsContinuity(baseSession({ end_time: "not-a-date" }))).toBe(false);
  });

  it("fails when end_time is not after start_time (zero duration)", () => {
    expect(
      checkGpsContinuity(baseSession({ end_time: "2026-01-01T08:00:00.000Z" }))
    ).toBe(false);
  });

  it("fails when end_time is before start_time", () => {
    expect(
      checkGpsContinuity(baseSession({ end_time: "2026-01-01T07:00:00.000Z" }))
    ).toBe(false);
  });

  it("fails when reported distance is far shorter than straight-line distance", () => {
    // straight-line ~7.7km, reporting 1km is implausible (route can't be
    // shorter than crow-flies distance beyond the tolerance).
    expect(checkGpsContinuity(baseSession({ distance_km: 1 }))).toBe(false);
  });

  it("passes when reported distance is within the straight-line tolerance", () => {
    const straightLine = haversineDistanceKm(6.5244, 3.3792, 6.4550, 3.3841);
    expect(
      checkGpsContinuity(baseSession({ distance_km: straightLine * 0.95 }))
    ).toBe(true);
  });

  it("fails when reported distance wildly exceeds a plausible detour ratio", () => {
    expect(checkGpsContinuity(baseSession({ distance_km: 500 }))).toBe(false);
  });

  it("fails on implausible (teleporting) speed for a long single-point trip", () => {
    // Lagos to Abuja (~500km) reported in 5 minutes => ~6000 km/h.
    expect(
      checkGpsContinuity(
        baseSession({
          start_lat: 6.5244,
          start_lng: 3.3792,
          end_lat: 9.0765,
          end_lng: 7.3986,
          distance_km: 500,
          end_time: "2026-01-01T08:05:00.000Z",
        })
      )
    ).toBe(false);
  });

  it("passes at exactly the max plausible speed boundary", () => {
    // 1 hour trip, 180km => exactly 180 km/h with a matching straight line.
    const session = baseSession({
      start_lat: 0,
      start_lng: 0,
      end_lat: 1.617, // ~180km north at the equator
      end_lng: 0,
      distance_km: 180,
      start_time: "2026-01-01T08:00:00.000Z",
      end_time: "2026-01-01T09:00:00.000Z",
    });
    expect(checkGpsContinuity(session)).toBe(true);
  });

  it("fails just above the max plausible speed boundary", () => {
    const session = baseSession({
      start_lat: 0,
      start_lng: 0,
      end_lat: 1.72, // ~191km
      end_lng: 0,
      distance_km: 191,
      start_time: "2026-01-01T08:00:00.000Z",
      end_time: "2026-01-01T09:00:00.000Z",
    });
    expect(checkGpsContinuity(session)).toBe(false);
  });

  it("handles a zero-distance round trip (start === end) within speed bounds", () => {
    const session = baseSession({
      start_lat: 6.5,
      start_lng: 3.3,
      end_lat: 6.5,
      end_lng: 3.3,
      distance_km: 5,
      start_time: "2026-01-01T08:00:00.000Z",
      end_time: "2026-01-01T08:30:00.000Z",
    });
    expect(checkGpsContinuity(session)).toBe(true);
  });

  it("rejects a zero-straight-line round trip whose distance implies teleporting", () => {
    const session = baseSession({
      start_lat: 6.5,
      start_lng: 3.3,
      end_lat: 6.5,
      end_lng: 3.3,
      distance_km: 1000,
      start_time: "2026-01-01T08:00:00.000Z",
      end_time: "2026-01-01T08:01:00.000Z",
    });
    expect(checkGpsContinuity(session)).toBe(false);
  });

  it("respects custom options overrides", () => {
    const session = baseSession({ distance_km: 300 });
    expect(
      checkGpsContinuity(session, {
        maxRouteToStraightLineRatio: 100,
        maxPlausibleSpeedKmh: 1000,
      })
    ).toBe(true);
  });
});

describe("checkDeviceAttestation", () => {
  const validDevice: DeviceRow = {
    id: "device-1",
    driver_id: "driver-1",
    device_model: "Tecno Spark 10",
    os_version: "Android 13",
    app_version: "1.0.0",
    device_attestation_key: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
  };

  it("passes for a valid hex attestation key", () => {
    expect(checkDeviceAttestation(validDevice)).toBe(true);
  });

  it("fails when device is null", () => {
    expect(checkDeviceAttestation(null)).toBe(false);
  });

  it("fails when device is undefined", () => {
    expect(checkDeviceAttestation(undefined)).toBe(false);
  });

  it("fails when device_attestation_key is null", () => {
    expect(checkDeviceAttestation({ ...validDevice, device_attestation_key: null })).toBe(
      false
    );
  });

  it("fails when device_attestation_key is an empty string", () => {
    expect(checkDeviceAttestation({ ...validDevice, device_attestation_key: "" })).toBe(
      false
    );
  });

  it("fails when device_attestation_key is only whitespace", () => {
    expect(checkDeviceAttestation({ ...validDevice, device_attestation_key: "   " })).toBe(
      false
    );
  });

  it("fails when device_attestation_key is too short", () => {
    expect(
      checkDeviceAttestation({ ...validDevice, device_attestation_key: "abc123" })
    ).toBe(false);
  });

  it("fails when device_attestation_key contains non-hex characters", () => {
    expect(
      checkDeviceAttestation({
        ...validDevice,
        device_attestation_key: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
      })
    ).toBe(false);
  });

  it("passes with a trimmed, uppercase hex key of exactly 32 chars", () => {
    expect(
      checkDeviceAttestation({
        ...validDevice,
        device_attestation_key: "  A1B2C3D4E5F60718293A4B5C6D7E8F90  ",
      })
    ).toBe(true);
  });
});

describe("checkTimestampConsistency", () => {
  it("passes for a normal completed trip", () => {
    expect(
      checkTimestampConsistency(baseSession(), { now: fixedNow })
    ).toBe(true);
  });

  it("fails when start_time is missing", () => {
    expect(
      checkTimestampConsistency(baseSession({ start_time: null }), { now: fixedNow })
    ).toBe(false);
  });

  it("fails when end_time is missing", () => {
    expect(
      checkTimestampConsistency(baseSession({ end_time: null }), { now: fixedNow })
    ).toBe(false);
  });

  it("fails for an unparseable start_time", () => {
    expect(
      checkTimestampConsistency(baseSession({ start_time: "garbage" }), { now: fixedNow })
    ).toBe(false);
  });

  it("fails for an unparseable end_time", () => {
    expect(
      checkTimestampConsistency(baseSession({ end_time: "garbage" }), { now: fixedNow })
    ).toBe(false);
  });

  it("fails when start_time equals end_time", () => {
    expect(
      checkTimestampConsistency(
        baseSession({ end_time: "2026-01-01T08:00:00.000Z" }),
        { now: fixedNow }
      )
    ).toBe(false);
  });

  it("fails when start_time is after end_time", () => {
    expect(
      checkTimestampConsistency(
        baseSession({ start_time: "2026-01-01T09:00:00.000Z", end_time: "2026-01-01T08:00:00.000Z" }),
        { now: fixedNow }
      )
    ).toBe(false);
  });

  it("fails when start_time is in the future", () => {
    expect(
      checkTimestampConsistency(
        baseSession({
          start_time: "2026-01-02T08:00:00.000Z",
          end_time: "2026-01-02T08:30:00.000Z",
        }),
        { now: fixedNow }
      )
    ).toBe(false);
  });

  it("fails when end_time is in the future", () => {
    expect(
      checkTimestampConsistency(
        baseSession({ end_time: "2026-01-02T08:30:00.000Z" }),
        { now: fixedNow }
      )
    ).toBe(false);
  });

  it("passes within the clock-skew tolerance window", () => {
    // now is 09:00:00, end_time is 09:00:30 -> within default 60s tolerance
    expect(
      checkTimestampConsistency(
        baseSession({ end_time: "2026-01-01T09:00:30.000Z" }),
        { now: fixedNow }
      )
    ).toBe(true);
  });

  it("fails when session duration exceeds the max session duration", () => {
    expect(
      checkTimestampConsistency(
        baseSession({
          start_time: "2025-12-30T08:00:00.000Z",
          end_time: "2025-12-31T09:00:00.000Z", // 25 hours
        }),
        { now: () => new Date("2026-01-01T12:00:00.000Z") }
      )
    ).toBe(false);
  });

  it("passes at exactly the max session duration boundary", () => {
    expect(
      checkTimestampConsistency(
        baseSession({
          start_time: "2025-12-31T00:00:00.000Z",
          end_time: "2026-01-01T00:00:00.000Z", // exactly 24 hours
        }),
        { now: () => new Date("2026-01-01T01:00:00.000Z") }
      )
    ).toBe(true);
  });

  it("fails when a nonzero-distance trip's duration is implausibly short", () => {
    expect(
      checkTimestampConsistency(
        baseSession({
          distance_km: 10,
          start_time: "2026-01-01T08:00:00.000Z",
          end_time: "2026-01-01T08:00:05.000Z", // 5 seconds
        }),
        { now: fixedNow }
      )
    ).toBe(false);
  });

  it("passes a zero-distance trip even with a very short duration", () => {
    expect(
      checkTimestampConsistency(
        baseSession({
          distance_km: 0,
          start_time: "2026-01-01T08:00:00.000Z",
          end_time: "2026-01-01T08:00:05.000Z",
        }),
        { now: fixedNow }
      )
    ).toBe(true);
  });

  it("passes a null-distance trip regardless of short duration", () => {
    expect(
      checkTimestampConsistency(
        baseSession({
          distance_km: null,
          start_time: "2026-01-01T08:00:00.000Z",
          end_time: "2026-01-01T08:00:05.000Z",
        }),
        { now: fixedNow }
      )
    ).toBe(true);
  });

  it("uses the real clock by default when now is not provided", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const pastEnd = new Date(Date.now() - 30_000).toISOString();
    expect(
      checkTimestampConsistency(baseSession({ start_time: past, end_time: pastEnd, distance_km: null }))
    ).toBe(true);
  });
});

describe("verifySession", () => {
  const validDevice: DeviceRow = {
    id: "device-1",
    driver_id: "driver-1",
    device_model: "Tecno Spark 10",
    os_version: "Android 13",
    app_version: "1.0.0",
    device_attestation_key: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
  };

  it("passes when all three checks pass", () => {
    const result = verifySession(
      { session: baseSession(), device: validDevice },
      { timestamp: { now: fixedNow } }
    );
    expect(result).toEqual({
      gpsContinuityOk: true,
      deviceAttestationOk: true,
      timestampConsistencyOk: true,
      passed: true,
    });
  });

  it("fails overall when device attestation fails, even if gps/timestamp pass", () => {
    const result = verifySession(
      { session: baseSession(), device: null },
      { timestamp: { now: fixedNow } }
    );
    expect(result.deviceAttestationOk).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("fails overall when gps continuity fails", () => {
    const result = verifySession(
      { session: baseSession({ distance_km: 500 }), device: validDevice },
      { timestamp: { now: fixedNow } }
    );
    expect(result.gpsContinuityOk).toBe(false);
    expect(result.passed).toBe(false);
  });

  it("fails overall when timestamp consistency fails", () => {
    const result = verifySession(
      { session: baseSession({ end_time: "2026-01-01T07:00:00.000Z" }), device: validDevice },
      { timestamp: { now: fixedNow } }
    );
    expect(result.timestampConsistencyOk).toBe(false);
    expect(result.passed).toBe(false);
  });
});
