import { ReportsClient } from "@/components/reports/ReportsClient";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { getFleetReports } from "@/lib/data/reports";
import { getDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent data — must render per-request, never
// statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const client = getDataSource();
  const [reports, fleets] = await Promise.all([
    getFleetReports(client, FLEET_ID),
    client.getFleets({ id: FLEET_ID }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Reports & export</h1>
      <ReportsClient fleet={fleets[0] ?? null} reports={reports} />
    </div>
  );
}
