import { DriverListClient } from "@/components/drivers/DriverListClient";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { getDrivers } from "@/lib/data/drivers";
import { getDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent data — must render per-request, never
// statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function DriversPage() {
  const client = getDataSource();
  const rows = await getDrivers(client, FLEET_ID);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Drivers</h1>
      <DriverListClient rows={rows} />
    </div>
  );
}
