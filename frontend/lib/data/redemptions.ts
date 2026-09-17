import type { AlertGuardDataSource } from "@/lib/data/data-source";
import type { Redemption } from "@/lib/types";

export interface RedemptionRow {
  redemption: Redemption;
  driverName: string;
}

/** Redemptions admin table (PRD Section 8.7): all of a fleet's drivers' redemptions, newest first. */
export async function getRedemptions(
  client: AlertGuardDataSource,
  fleetId: string,
): Promise<RedemptionRow[]> {
  const drivers = await client.getProfiles({ fleet_id: fleetId, role: "driver" });
  const driversById = new Map(drivers.map((d) => [d.id, d]));

  const perDriverRedemptions = await Promise.all(
    drivers.map((d) => client.getRedemptions({ driver_id: d.id })),
  );
  const all = perDriverRedemptions.flat();

  return all
    .map((redemption) => ({
      redemption,
      driverName: driversById.get(redemption.driver_id)?.full_name ?? "Unknown driver",
    }))
    .sort((a, b) => b.redemption.created_at.localeCompare(a.redemption.created_at));
}
