"use client";

import { useState } from "react";
import {
  useRealtimeSubscription,
  type RealtimeClientLike,
} from "@/lib/hooks/useRealtimeChannel";
import type { DrowsinessEvent } from "@/lib/types";

/**
 * Live alerts feed subscription (PRD Section 8.5): streams new `critical`
 * drowsiness_events, newest first, on top of the server-loaded initial rows.
 * Mirrors Backend PRD Section 7's `updateDashboard(payload.new)` pattern —
 * here that's prepending the new event to local state.
 */
export function useLiveAlerts(
  client: RealtimeClientLike | null,
  initialAlerts: DrowsinessEvent[],
): DrowsinessEvent[] {
  const [alerts, setAlerts] = useState<DrowsinessEvent[]>(initialAlerts);

  useRealtimeSubscription<DrowsinessEvent>(
    client,
    {
      channelName: "fleet-safety-monitor",
      table: "drowsiness_events",
      event: "INSERT",
      filter: "severity=eq.critical",
    },
    (event) => {
      setAlerts((prev) => [event, ...prev]);
    },
  );

  return alerts;
}
