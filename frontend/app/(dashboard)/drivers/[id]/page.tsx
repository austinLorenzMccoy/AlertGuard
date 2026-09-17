import { notFound } from "next/navigation";
import { DriverHeader } from "@/components/driver-detail/DriverHeader";
import { RewardHistory } from "@/components/driver-detail/RewardHistory";
import { ScoreTrendChart } from "@/components/driver-detail/ScoreTrendChart";
import { SessionList } from "@/components/driver-detail/SessionList";
import { getFleetContext, requireFleetId } from "@/lib/auth/fleet-context";
import { getDriverDetail } from "@/lib/data/drivers";
import { getServerDataSource } from "@/lib/data/get-data-source";
import { buildScoreTrend } from "@/lib/logic/trend";

export default async function DriverDetailPage({
  params,
}: {
  params: { id: string };
}) {
  // Not fleet-scoped by params (the driver id alone identifies the row),
  // but still requires a resolved fleet context so this page never renders
  // for a visitor the layout should have redirected away — see
  // `requireFleetId`'s doc comment.
  requireFleetId(await getFleetContext());
  const client = getServerDataSource();
  const detail = await getDriverDetail(client, params.id);

  if (!detail) {
    notFound();
  }

  const trend = buildScoreTrend(detail.sessions, 30);

  return (
    <div className="flex flex-col gap-6">
      <DriverHeader driver={detail.driver} />
      <section>
        <h2 className="mb-2 font-display text-lg text-fog">30-day score trend</h2>
        <ScoreTrendChart points={trend} />
      </section>
      <section>
        <h2 className="mb-2 font-display text-lg text-fog">Sessions</h2>
        <SessionList sessions={detail.sessions} events={detail.events} />
      </section>
      <section>
        <h2 className="mb-2 font-display text-lg text-fog">Rewards</h2>
        <RewardHistory rewards={detail.rewards} />
      </section>
    </div>
  );
}
