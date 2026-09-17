"use client";

import { DriverGrid } from "@/components/overview/DriverGrid";
import { TopStrip } from "@/components/overview/TopStrip";
import { useLiveDriverGrid } from "@/lib/hooks/useLiveDriverGrid";
import type { RealtimeClientLike } from "@/lib/hooks/useRealtimeChannel";
import type { FleetOverviewData } from "@/lib/types";

export interface OverviewClientProps {
  data: FleetOverviewData;
  realtimeClient: RealtimeClientLike | null;
}

/**
 * Overview screen client half (PRD Section 8.2): takes the server-loaded
 * snapshot and layers a realtime subscription on top so the grid updates
 * without a refresh button. `realtimeClient` is injected so tests (and the
 * server render) can pass null/a fake instead of a live Supabase socket.
 */
export function OverviewClient({ data, realtimeClient }: OverviewClientProps) {
  const cards = useLiveDriverGrid(realtimeClient, data.driverCards);

  return (
    <div className="flex flex-col gap-6">
      <TopStrip
        fleetName={data.fleet?.name ?? "Unknown fleet"}
        activeDriversNow={cards.filter((c) => c.isLive).length}
        todayAvgScore={data.todayAvgScore}
        todayCriticalAlertCount={data.todayCriticalAlertCount}
      />
      <DriverGrid cards={cards} />
    </div>
  );
}
