import { describe, expect, it } from "vitest";
import { buildScoreTrend, buildSevenDaySparkline } from "@/lib/logic/trend";
import type { DrivingSession } from "@/lib/types";

const ref = new Date("2026-09-17T12:00:00.000Z");

function session(overrides: Partial<DrivingSession>): DrivingSession {
  return {
    id: "s1",
    driver_id: "d1",
    device_id: null,
    fleet_id: "f1",
    start_time: "2026-09-17T08:00:00.000Z",
    end_time: null,
    start_lat: null,
    start_lng: null,
    end_lat: null,
    end_lng: null,
    distance_km: 10,
    gps_trace_hash: null,
    status: "verified",
    safety_score: 80,
    created_at: "2026-09-17T08:00:00.000Z",
    ...overrides,
  };
}

describe("buildScoreTrend", () => {
  it("returns an empty array when days <= 0", () => {
    expect(buildScoreTrend([], 0, ref)).toEqual([]);
    expect(buildScoreTrend([], -3, ref)).toEqual([]);
  });

  it("returns one point per day with null score when no sessions", () => {
    const points = buildScoreTrend([], 3, ref);
    expect(points).toHaveLength(3);
    expect(points.every((p) => p.score === null)).toBe(true);
    expect(points[2].date).toBe("2026-09-17");
  });

  it("averages multiple sessions on the same day", () => {
    const sessions = [
      session({ id: "a", start_time: "2026-09-17T06:00:00.000Z", safety_score: 60 }),
      session({ id: "b", start_time: "2026-09-17T09:00:00.000Z", safety_score: 100 }),
    ];
    const points = buildScoreTrend(sessions, 1, ref);
    expect(points).toHaveLength(1);
    expect(points[0].score).toBe(80);
  });

  it("ignores sessions with a null safety_score", () => {
    const sessions = [session({ safety_score: null })];
    const points = buildScoreTrend(sessions, 1, ref);
    expect(points[0].score).toBeNull();
  });

  it("places sessions on the correct historical day", () => {
    const sessions = [session({ start_time: "2026-09-15T08:00:00.000Z", safety_score: 42 })];
    const points = buildScoreTrend(sessions, 7, ref);
    const day = points.find((p) => p.date === "2026-09-15");
    expect(day?.score).toBe(42);
  });
});

describe("buildSevenDaySparkline", () => {
  it("returns 7 score values", () => {
    const sparkline = buildSevenDaySparkline([session({})], ref);
    expect(sparkline).toHaveLength(7);
  });
});
