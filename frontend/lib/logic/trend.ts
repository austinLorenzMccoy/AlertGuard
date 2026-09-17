import type { DrivingSession } from "@/lib/types";

export interface TrendPoint {
  /** ISO date (yyyy-mm-dd), the calendar day this point represents. */
  date: string;
  /** Average safety score for sessions completed that day, or null if none. */
  score: number | null;
}

/**
 * Shapes a driver's session history into one point per day for the last
 * `days` calendar days (inclusive of today), for sparkline / trend-chart
 * rendering. Days with no completed session get `score: null` so the chart
 * can render a gap instead of a misleading zero.
 *
 * `referenceDate` defaults to now but is injectable for deterministic tests.
 */
export function buildScoreTrend(
  sessions: DrivingSession[],
  days: number,
  referenceDate: Date = new Date(),
): TrendPoint[] {
  if (days <= 0) return [];

  const scoresByDate = new Map<string, number[]>();
  for (const session of sessions) {
    if (session.safety_score === null || session.safety_score === undefined) continue;
    const day = toDateKey(new Date(session.start_time));
    const existing = scoresByDate.get(day);
    if (existing) {
      existing.push(session.safety_score);
    } else {
      scoresByDate.set(day, [session.safety_score]);
    }
  }

  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(referenceDate);
    d.setDate(d.getDate() - i);
    const key = toDateKey(d);
    const scores = scoresByDate.get(key);
    const avg = scores && scores.length > 0 ? average(scores) : null;
    points.push({ date: key, score: avg });
  }
  return points;
}

/** Convenience wrapper for the driver-list sparkline (PRD Section 8.3). */
export function buildSevenDaySparkline(
  sessions: DrivingSession[],
  referenceDate: Date = new Date(),
): (number | null)[] {
  return buildScoreTrend(sessions, 7, referenceDate).map((p) => p.score);
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}
