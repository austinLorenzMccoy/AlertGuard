import { RedemptionsClient } from "@/components/redemptions/RedemptionsClient";
import { FLEET_ID } from "@/lib/data/demo-seed";
import { getRedemptions } from "@/lib/data/redemptions";
import { getDataSource } from "@/lib/data/get-data-source";

// Fleet-scoped, session-dependent data — must render per-request, never
// statically prerendered at build time.
export const dynamic = "force-dynamic";

export default async function RedemptionsPage() {
  const client = getDataSource();
  const rows = await getRedemptions(client, FLEET_ID);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl text-fog">Redemptions</h1>
      <RedemptionsClient initialRows={rows} />
    </div>
  );
}
