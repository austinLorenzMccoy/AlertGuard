import { OverviewClient } from "@/components/overview/OverviewClient";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { getFleetOverview } from "@/lib/data/overview";
import { getDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent, realtime data — must render per-request,
// never statically prerendered at build time (there is no fleet manager
// session or real fleet_id available during `next build`).
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const client = getDataSource();
  const data = await getFleetOverview(client, FLEET_ID);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Overview</h1>
      <OverviewClient data={data} realtimeClient={null} />
    </div>
  );
}
