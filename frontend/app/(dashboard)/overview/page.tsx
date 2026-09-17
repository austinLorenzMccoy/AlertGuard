import { OverviewClient } from "@/components/overview/OverviewClient";
import { getFleetContext, requireFleetId } from "@/lib/auth/fleet-context";
import { getFleetOverview } from "@/lib/data/overview";
import { getServerDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent, realtime data — must render per-request,
// never statically prerendered at build time (there is no fleet manager
// session or real fleet_id available during `next build`).
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const fleetId = requireFleetId(await getFleetContext());
  const client = getServerDataSource();
  const data = await getFleetOverview(client, fleetId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Overview</h1>
      <OverviewClient data={data} realtimeClient={null} />
    </div>
  );
}
