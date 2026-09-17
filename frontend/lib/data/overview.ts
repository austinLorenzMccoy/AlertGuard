import type { AlertGuardDataSource } from "@/lib/data/data-source";
import type { DriverGridCard, FleetOverviewData } from "@/lib/types";

/**
 * Fleet-wide snapshot for the Overview screen (PRD Section 8.2):
 * active-drivers-now count, today's average safety score, today's critical
 * alert count, and the live driver grid.
 */
export async function getFleetOverview(
  client: AlertGuardDataSource,
  fleetId: string,
  referenceDate: Date = new Date(),
): Promise<FleetOverviewData> {
  const [fleets, drivers, sessions] = await Promise.all([
    client.getFleets({ id: fleetId }),
    client.getProfiles({ fleet_id: fleetId, role: "driver" }),
    client.getDrivingSessions({ fleet_id: fleetId }),
  ]);

  const todayKey = referenceDate.toISOString().slice(0, 10);
  const todaysSessions = sessions.filter(
    (s) => s.start_time.slice(0, 10) === todayKey,
  );

  const activeSessionsByDriver = new Map<string, (typeof sessions)[number]>();
  for (const session of sessions) {
    if (session.status === "active") {
      activeSessionsByDriver.set(session.driver_id, session);
    }
  }

  const scoredToday = todaysSessions.filter(
    (s) => s.safety_score !== null && s.safety_score !== undefined,
  );
  const todayAvgScore =
    scoredToday.length > 0
      ? scoredToday.reduce((sum, s) => sum + (s.safety_score as number), 0) /
        scoredToday.length
      : null;

  const todaysSessionIds = new Set(todaysSessions.map((s) => s.id));
  const events = await client.getDrowsinessEvents({ severity: "critical" });
  const todayCriticalAlertCount = events.filter((e) =>
    todaysSessionIds.has(e.session_id),
  ).length;

  const driverCards: DriverGridCard[] = drivers.map((driver) => {
    const activeSession = activeSessionsByDriver.get(driver.id) ?? null;
    const latestForDriver = sessions
      .filter((s) => s.driver_id === driver.id)
      .sort((a, b) => b.start_time.localeCompare(a.start_time))[0];
    return {
      driver,
      activeSession,
      currentScore: activeSession?.safety_score ?? latestForDriver?.safety_score ?? null,
      isLive: activeSession !== null,
    };
  });

  return {
    fleet: fleets[0] ?? null,
    activeDriversNow: activeSessionsByDriver.size,
    todayAvgScore,
    todayCriticalAlertCount,
    driverCards,
  };
}
