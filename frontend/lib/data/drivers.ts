import type { AlertGuardDataSource } from "@/lib/data/data-source";
import { classifyScoreBand } from "@/lib/logic/safety-score";
import { buildSevenDaySparkline } from "@/lib/logic/trend";
import type { DriverDetailData, DriverListRow } from "@/lib/types";

/** Driver list rows for PRD Section 8.3. */
export async function getDrivers(
  client: AlertGuardDataSource,
  fleetId: string,
  referenceDate: Date = new Date(),
): Promise<DriverListRow[]> {
  const [drivers, sessions] = await Promise.all([
    client.getProfiles({ fleet_id: fleetId, role: "driver" }),
    client.getDrivingSessions({ fleet_id: fleetId }),
  ]);

  const sessionIds = sessions.map((s) => s.id);
  const events =
    sessionIds.length > 0
      ? await client.getDrowsinessEvents({ session_ids: sessionIds })
      : [];

  return drivers.map((driver) => {
    const driverSessions = sessions.filter((s) => s.driver_id === driver.id);
    const sortedByRecency = [...driverSessions].sort((a, b) =>
      b.start_time.localeCompare(a.start_time),
    );
    const mostRecent = sortedByRecency[0];
    const activeSession = driverSessions.find((s) => s.status === "active");
    const currentScore = activeSession?.safety_score ?? mostRecent?.safety_score ?? null;
    const driverSessionIds = new Set(driverSessions.map((s) => s.id));
    const alertCount = events.filter((e) => driverSessionIds.has(e.session_id)).length;

    return {
      driver,
      currentScore,
      scoreBand: classifyScoreBand(currentScore),
      sevenDayTrend: buildSevenDaySparkline(driverSessions, referenceDate),
      totalVerifiedTrips: driverSessions.filter((s) => s.status === "verified").length,
      lastActive: mostRecent?.start_time ?? null,
      alertCount,
      isActive: activeSession !== undefined,
    };
  });
}

/** Driver detail data for PRD Section 8.4. */
export async function getDriverDetail(
  client: AlertGuardDataSource,
  driverId: string,
): Promise<DriverDetailData | null> {
  const [profiles, sessions, rewards] = await Promise.all([
    client.getProfiles({ id: driverId }),
    client.getDrivingSessions({ driver_id: driverId }),
    client.getRewards({ driver_id: driverId }),
  ]);

  const driver = profiles[0];
  if (!driver) return null;

  const sessionIds = sessions.map((s) => s.id);
  const events =
    sessionIds.length > 0
      ? await client.getDrowsinessEvents({ session_ids: sessionIds })
      : [];

  return { driver, sessions, events, rewards };
}
