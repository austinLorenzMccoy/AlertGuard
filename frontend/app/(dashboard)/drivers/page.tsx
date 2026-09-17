import { DriverListClient } from "@/components/drivers/DriverListClient";
import { getFleetContext, requireFleetId } from "@/lib/auth/fleet-context";
import { getDrivers } from "@/lib/data/drivers";
import { getServerDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent data — must render per-request, never
// statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function DriversPage() {
  const fleetId = requireFleetId(await getFleetContext());
  const client = getServerDataSource();
  const rows = await getDrivers(client, fleetId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Drivers</h1>
      <DriverListClient rows={rows} />
    </div>
  );
}
