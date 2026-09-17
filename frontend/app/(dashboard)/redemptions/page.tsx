import { RedemptionsClient } from "@/components/redemptions/RedemptionsClient";
import { getFleetContext, requireFleetId } from "@/lib/auth/fleet-context";
import { getRedemptions } from "@/lib/data/redemptions";
import { getServerDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent data — must render per-request, never
// statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function RedemptionsPage() {
  const fleetId = requireFleetId(await getFleetContext());
  const client = getServerDataSource();
  const rows = await getRedemptions(client, fleetId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Redemptions</h1>
      <RedemptionsClient initialRows={rows} />
    </div>
  );
}
