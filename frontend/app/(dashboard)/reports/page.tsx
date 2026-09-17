import { ReportsClient } from "@/components/reports/ReportsClient";
import { getFleetContext, requireFleetId } from "@/lib/auth/fleet-context";
import { getFleetReports } from "@/lib/data/reports";
import { getServerDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent data — must render per-request, never
// statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const fleetId = requireFleetId(await getFleetContext());
  const client = getServerDataSource();
  const [reports, fleets] = await Promise.all([
    getFleetReports(client, fleetId),
    client.getFleets({ id: fleetId }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Reports & export</h1>
      <ReportsClient fleet={fleets[0] ?? null} reports={reports} />
    </div>
  );
}
