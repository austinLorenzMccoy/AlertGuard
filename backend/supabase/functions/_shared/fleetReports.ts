// Pure fleet-reporting aggregation logic for `generate-fleet-reports`.
// PRD reference: Backend PRD Section 10 Step 10 / Section 12 Step 10:
// "Build a scheduled Edge Function (cron, via pg_cron or Supabase Scheduled
// Functions) that aggregates into fleet_reports weekly."

export interface SessionForReport {
  safety_score: number | null;
}

export interface WeeklyPeriod {
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
}

/**
 * Computes the most recently completed Monday-Sunday week relative to
 * `referenceDate`, in UTC. Used by the weekly cron so "this week" always
 * means "the week that just ended", regardless of what day the cron fires.
 */
export function getPreviousWeekPeriod(referenceDate: Date): WeeklyPeriod {
  const day = referenceDate.getUTCDay(); // 0 = Sunday ... 6 = Saturday
  const diffToMonday = (day + 6) % 7; // days since most recent Monday
  const thisMonday = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate() - diffToMonday
    )
  );
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(thisMonday.getUTCDate() - 7);
  const lastSunday = new Date(thisMonday);
  lastSunday.setUTCDate(thisMonday.getUTCDate() - 1);

  return {
    periodStart: toDateString(lastMonday),
    periodEnd: toDateString(lastSunday),
  };
}

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface FleetAggregate {
  avgSafetyScore: number;
  totalSessions: number;
  totalCriticalAlerts: number;
}

/**
 * Aggregates one fleet's sessions + critical-alert count for a reporting
 * period. `total_sessions` counts every session in the period regardless of
 * whether it was ever scored (e.g. a still-active or flagged session);
 * `avg_safety_score` is averaged only over sessions that have a numeric
 * score, and is 0 (not NaN/null) when no session in the period was scored.
 */
export function computeFleetAggregate(
  sessions: SessionForReport[],
  totalCriticalAlerts: number
): FleetAggregate {
  const scoredSessions = sessions.filter(
    (s): s is { safety_score: number } =>
      typeof s.safety_score === "number" && Number.isFinite(s.safety_score)
  );

  const avgSafetyScore =
    scoredSessions.length === 0
      ? 0
      : roundTo2(
          scoredSessions.reduce((sum, s) => sum + s.safety_score, 0) /
            scoredSessions.length
        );

  return {
    avgSafetyScore,
    totalSessions: sessions.length,
    totalCriticalAlerts: Math.max(0, totalCriticalAlerts),
  };
}

function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface FleetReportRow {
  fleetId: string;
  periodStart: string;
  periodEnd: string;
  avgSafetyScore: number;
  totalSessions: number;
  totalCriticalAlerts: number;
}

export interface FleetReportsDeps {
  listFleetIds: () => Promise<string[]>;
  getSessionsForFleetInPeriod: (
    fleetId: string,
    period: WeeklyPeriod
  ) => Promise<SessionForReport[]>;
  getCriticalAlertCountForFleetInPeriod: (
    fleetId: string,
    period: WeeklyPeriod
  ) => Promise<number>;
  insertFleetReport: (row: FleetReportRow) => Promise<void>;
}

/**
 * Orchestrates the weekly generate-fleet-reports run across every fleet, for
 * the week ending before `referenceDate`. Each collaborator is injected so
 * the whole run is testable without a real Supabase client.
 */
export async function generateFleetReports(
  deps: FleetReportsDeps,
  referenceDate: Date
): Promise<FleetReportRow[]> {
  const period = getPreviousWeekPeriod(referenceDate);
  const fleetIds = await deps.listFleetIds();

  const rows: FleetReportRow[] = [];
  for (const fleetId of fleetIds) {
    const [sessions, criticalAlerts] = await Promise.all([
      deps.getSessionsForFleetInPeriod(fleetId, period),
      deps.getCriticalAlertCountForFleetInPeriod(fleetId, period),
    ]);

    const aggregate = computeFleetAggregate(sessions, criticalAlerts);

    const row: FleetReportRow = {
      fleetId,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      avgSafetyScore: aggregate.avgSafetyScore,
      totalSessions: aggregate.totalSessions,
      totalCriticalAlerts: aggregate.totalCriticalAlerts,
    };

    await deps.insertFleetReport(row);
    rows.push(row);
  }

  return rows;
}
