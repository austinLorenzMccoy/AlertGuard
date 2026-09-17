import { SettingsClient } from "@/components/settings/SettingsClient";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { getDataSource } from "@/lib/data/get-data-source";

export default async function SettingsPage() {
  const client = getDataSource();
  const [fleets, managers] = await Promise.all([
    client.getFleets({ id: FLEET_ID }),
    client.getProfiles({ fleet_id: FLEET_ID, role: "fleet_manager" }),
  ]);
  const fleet = fleets[0] ?? null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Settings</h1>
      <SettingsClient
        initialFleetName={fleet?.name ?? ""}
        initialLogoUrl=""
        initialManagers={managers.map((m) => ({ id: m.id, email: m.phone ?? m.id }))}
        initialNotificationPrefs={{
          critical: { sms: true, email: true },
          vibration: { sms: false, email: true },
          soft: { sms: false, email: false },
        }}
      />
    </div>
  );
}
