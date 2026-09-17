import { SettingsClient } from "@/components/settings/SettingsClient";
import { getFleetContext, requireFleetId, requireProfile } from "@/lib/auth/fleet-context";
import { getServerDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent data — must render per-request, never
// statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const fleetContext = await getFleetContext();
  const fleetId = requireFleetId(fleetContext);
  const currentUserProfile = requireProfile(fleetContext);
  const client = getServerDataSource();
  const [fleets, managers] = await Promise.all([
    client.getFleets({ id: fleetId }),
    client.getProfiles({ fleet_id: fleetId, role: "fleet_manager" }),
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
        currentUserRole={currentUserProfile.role}
        currentUserFleetId={currentUserProfile.fleet_id}
      />
    </div>
  );
}
