import type { AlertGuardDataSource } from "@/lib/data/data-source";
import type { FleetReport } from "@/lib/types";

/** Pre-computed fleet reports for PRD Section 8.6, newest period first. */
export async function getFleetReports(
  client: AlertGuardDataSource,
  fleetId: string,
): Promise<FleetReport[]> {
  const reports = await client.getFleetReports({ fleet_id: fleetId });
  return [...reports].sort((a, b) => b.period_start.localeCompare(a.period_start));
}
