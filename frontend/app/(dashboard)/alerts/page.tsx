import { LiveAlertsFeedClient } from "@/components/alerts/LiveAlertsFeedClient";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { buildDriverInfoBySessionId, getLiveAlerts } from "@/lib/data/alerts";
import { getDataSource } from "@/lib/data/get-data-source";

export default async function AlertsPage() {
  const client = getDataSource();
  const [rows, sessions, drivers] = await Promise.all([
    getLiveAlerts(client, FLEET_ID),
    client.getDrivingSessions({ fleet_id: FLEET_ID }),
    client.getProfiles({ fleet_id: FLEET_ID, role: "driver" }),
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
