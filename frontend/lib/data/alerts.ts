import type { AlertGuardDataSource } from "@/lib/data/data-source";
import type { DrowsinessEvent, Profile } from "@/lib/types";

export interface LiveAlertRow {
  event: DrowsinessEvent;
  driverName: string;
  driverId: string;
  sessionId: string;
}

export interface SessionDriverInfo {
  driverId: string;
  driverName: string;
}

/**
 * Maps session_id -> driver id/name, so realtime-inserted raw
 * `drowsiness_events` (which only carry `session_id`) can be labelled and
 * linked to their driver client-side without an extra query per event.
 */
export function buildDriverInfoBySessionId(
  sessions: { id: string; driver_id: string }[],
  drivers: Profile[],
): Record<string, SessionDriverInfo> {
  const driversById = new Map(drivers.map((d) => [d.id, d]));
  const lookup: Record<string, SessionDriverInfo> = {};
  for (const session of sessions) {
    const driver = driversById.get(session.driver_id);
    lookup[session.id] = {
      driverId: session.driver_id,
      driverName: driver?.full_name ?? "Unknown driver",
    };
  }
  return lookup;
}

/**
 * Live alerts feed (PRD Section 8.5): critical drowsiness events across the
 * fleet, newest first. This is the initial/server-loaded page; the realtime
 * hook (`lib/hooks/useLiveAlerts.ts`) prepends new rows as they stream in.
 */
export async function getLiveAlerts(
  client: AlertGuardDataSource,
  fleetId: string,
  limit = 50,
): Promise<LiveAlertRow[]> {
  const [sessions, events] = await Promise.all([
    client.getDrivingSessions({ fleet_id: fleetId }),
    client.getDrowsinessEvents({ severity: "critical" }),
  ]);

  const sessionsById = new Map(sessions.map((s) => [s.id, s]));
  const drivers = await client.getProfiles({ fleet_id: fleetId, role: "driver" });
  const driverInfoBySessionId = buildDriverInfoBySessionId(sessions, drivers);

  const rows: LiveAlertRow[] = events
    .filter((e) => sessionsById.has(e.session_id))
    .map((event) => {
      const info = driverInfoBySessionId[event.session_id];
      return {
        event,
        driverName: info.driverName,
        driverId: info.driverId,
        sessionId: event.session_id,
      };
    })
    .sort((a, b) => b.event.occurred_at.localeCompare(a.event.occurred_at));

  return rows.slice(0, limit);
}
