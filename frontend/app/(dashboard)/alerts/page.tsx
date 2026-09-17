import { LiveAlertsFeedClient } from "@/components/alerts/LiveAlertsFeedClient";
import { getFleetContext, requireFleetId } from "@/lib/auth/fleet-context";
import { buildDriverInfoBySessionId, getLiveAlerts } from "@/lib/data/alerts";
import { getServerDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent, realtime data — must render per-request,
// never statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const fleetId = requireFleetId(await getFleetContext());
  const client = getServerDataSource();
  const [rows, sessions, drivers] = await Promise.all([
    getLiveAlerts(client, fleetId),
    client.getDrivingSessions({ fleet_id: fleetId }),
    client.getProfiles({ fleet_id: fleetId, role: "driver" }),
  ]);
  const driverInfoBySessionId = buildDriverInfoBySessionId(sessions, drivers);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Live alerts</h1>
      <LiveAlertsFeedClient
        initialRows={rows}
        driverInfoBySessionId={driverInfoBySessionId}
        realtimeClient={null}
      />
    </div>
  );
}
