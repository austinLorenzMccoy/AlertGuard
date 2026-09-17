// Pure anti-spoofing verification logic for `verify-session`.
// PRD reference: Backend PRD Section 10.1.
//
// The PRD names checkGpsContinuity / checkDeviceAttestation /
// checkTimestampConsistency but only shows a call-site comment for each
// ("no teleporting, plausible speed"). The schema (Section 4) only stores
// session-level start/end coordinates and a client-side GPS-trace *hash* —
// the full point-by-point trace is deliberately not stored server-side
// (Section 13: "only the hash and summary stats ... stored, unless a session
// is flagged for dispute"). So "GPS continuity" here is checked at the
// session-summary level: the reported distance must be physically consistent
// with the straight-line distance between the reported start/end points, and
// the implied average speed must be plausible for a road vehicle.

import type { DeviceRow, DrivingSessionRow } from "./types.ts";

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two lat/lng points, in kilometers. */
export function haversineDistanceKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export interface GpsContinuityOptions {
  /** Max plausible average speed for a road vehicle trip, km/h. Default 180. */
  maxPlausibleSpeedKmh?: number;
  /**
   * Reported route distance may be shorter than the straight-line distance by
   * at most this fraction, to absorb GPS/hash rounding error. Default 0.1 (10%).
   */
  straightLineTolerance?: number;
  /**
   * Reported route distance may not exceed the straight-line distance by more
   * than this multiple (a very long detour is itself a red flag for a spoofed
   * or corrupted trace). Default 5x.
   */
  maxRouteToStraightLineRatio?: number;
}

const DEFAULT_GPS_OPTIONS: Required<GpsContinuityOptions> = {
  maxPlausibleSpeedKmh: 180,
  straightLineTolerance: 0.1,
  maxRouteToStraightLineRatio: 5,
};

/**
 * Checks that a session's reported distance/duration/endpoints are mutually
 * consistent with plausible real-world driving — rejects teleporting
 * (distance/time implying an impossible speed) and rejects a reported
 * distance that doesn't match the geometry of the reported start/end points.
 */
export function checkGpsContinuity(
  session: Pick<
    DrivingSessionRow,
    | "start_lat"
    | "start_lng"
    | "end_lat"
    | "end_lng"
    | "start_time"
    | "end_time"
    | "distance_km"
  >,
  options: GpsContinuityOptions = {}
): boolean {
  const opts = { ...DEFAULT_GPS_OPTIONS, ...options };

  const { start_lat, start_lng, end_lat, end_lng, start_time, end_time, distance_km } =
    session;

  if (
    start_lat == null ||
    start_lng == null ||
    end_lat == null ||
    end_lng == null
  ) {
    return false;
  }

  if (!isValidLatLng(start_lat, start_lng) || !isValidLatLng(end_lat, end_lng)) {
    return false;
  }

  if (distance_km == null || distance_km < 0) {
    return false;
  }

  const start = start_time ? new Date(start_time) : null;
  const end = end_time ? new Date(end_time) : null;
  if (!start || !end || isNaN(start.getTime()) || isNaN(end.getTime())) {
    return false;
  }

  const durationHours = (end.getTime() - start.getTime()) / 3_600_000;
  if (durationHours <= 0) {
    return false;
  }

  const straightLineKm = haversineDistanceKm(start_lat, start_lng, end_lat, end_lng);

  // Reported distance can't be meaningfully shorter than crow-flies distance.
  const minPlausibleDistance = straightLineKm * (1 - opts.straightLineTolerance);
  if (distance_km < minPlausibleDistance) {
    return false;
  }

  // A distance wildly larger than the straight-line distance suggests a
  // corrupted or spoofed trace rather than a real detour.
  if (straightLineKm > 0 && distance_km > straightLineKm * opts.maxRouteToStraightLineRatio) {
    return false;
  }
  // Special case: start == end (round trip / parked) but a large distance is
  // reported — still bounded by the speed check below, but guard the zero
  // straight-line-distance case explicitly so a huge "round trip" isn't
  // silently allowed through the ratio check above (which is skipped when
  // straightLineKm === 0).
  if (straightLineKm === 0 && distance_km > opts.maxPlausibleSpeedKmh * durationHours) {
    return false;
  }

  const impliedSpeedKmh = distance_km / durationHours;
  if (impliedSpeedKmh > opts.maxPlausibleSpeedKmh) {
    return false;
  }

  return true;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/**
 * Validates that the reporting device presented an attestation key, and that
 * it is shaped like a real attestation value rather than empty/garbage input.
 * The PRD does not specify a concrete format; we require a hex-like token of
 * at least 32 characters (equivalent to a 128-bit key digest), which is
 * deliberately permissive about *which* attestation scheme produced it
 * (Play Integrity, SafetyNet, or a custom HMAC) while still rejecting
 * obviously-missing or trivially-fake values.
 */
const ATTESTATION_KEY_PATTERN = /^[a-f0-9]{32,}$/i;

export function checkDeviceAttestation(
  device: Pick<DeviceRow, "device_attestation_key"> | null | undefined
): boolean {
  if (!device) return false;
  const key = device.device_attestation_key;
  if (!key || typeof key !== "string") return false;
  const trimmed = key.trim();
  if (trimmed.length === 0) return false;
  return ATTESTATION_KEY_PATTERN.test(trimmed);
}

export interface TimestampConsistencyOptions {
  /** Injectable clock so "no future timestamps" is testable deterministically. */
  now?: () => Date;
  /** Upper bound on a single session's duration, hours. Default 24. */
  maxSessionDurationHours?: number;
  /** Minimum plausible duration (seconds) for any session reporting nonzero distance. */
  minMovingDurationSeconds?: number;
  /** Small clock-skew allowance for "future timestamp" checks, in seconds. */
  clockSkewToleranceSeconds?: number;
}

const DEFAULT_TIMESTAMP_OPTIONS: Required<TimestampConsistencyOptions> = {
  now: () => new Date(),
  maxSessionDurationHours: 24,
  minMovingDurationSeconds: 10,
  clockSkewToleranceSeconds: 60,
};

/**
 * Checks start_time < end_time, that neither timestamp is in the future, and
 * that the resulting duration is plausible given the reported distance
 * (guards both "instant 400km trip" and "trip open for a week" cases).
 */
export function checkTimestampConsistency(
  session: Pick<DrivingSessionRow, "start_time" | "end_time" | "distance_km">,
  options: TimestampConsistencyOptions = {}
): boolean {
  const opts = { ...DEFAULT_TIMESTAMP_OPTIONS, ...options };

  const { start_time, end_time, distance_km } = session;
  if (!start_time || !end_time) return false;

  const start = new Date(start_time);
  const end = new Date(end_time);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;

  if (start.getTime() >= end.getTime()) return false;

  const nowMs = opts.now().getTime() + opts.clockSkewToleranceSeconds * 1000;
  if (start.getTime() > nowMs || end.getTime() > nowMs) return false;

  const durationHours = (end.getTime() - start.getTime()) / 3_600_000;
  if (durationHours > opts.maxSessionDurationHours) return false;

  if (distance_km != null && distance_km > 0) {
    const durationSeconds = durationHours * 3600;
    if (durationSeconds < opts.minMovingDurationSeconds) return false;
  }

  return true;
}

export interface VerificationInput {
  session: DrivingSessionRow;
  device: DeviceRow | null | undefined;
}

export interface VerificationResult {
  gpsContinuityOk: boolean;
  deviceAttestationOk: boolean;
  timestampConsistencyOk: boolean;
  passed: boolean;
}

export interface VerificationOptions {
  gps?: GpsContinuityOptions;
  timestamp?: TimestampConsistencyOptions;
}

/** Runs all three checks and combines them, mirroring the PRD's verify-session sketch. */
export function verifySession(
  input: VerificationInput,
  options: VerificationOptions = {}
): VerificationResult {
  const gpsContinuityOk = checkGpsContinuity(input.session, options.gps);
  const deviceAttestationOk = checkDeviceAttestation(input.device);
  const timestampConsistencyOk = checkTimestampConsistency(input.session, options.timestamp);

  return {
    gpsContinuityOk,
    deviceAttestationOk,
    timestampConsistencyOk,
    passed: gpsContinuityOk && deviceAttestationOk && timestampConsistencyOk,
  };
}
