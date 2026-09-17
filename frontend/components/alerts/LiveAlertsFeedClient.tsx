"use client";

import { useState } from "react";
import { AlertRow } from "@/components/alerts/AlertRow";
import { useLiveAlerts } from "@/lib/hooks/useLiveAlerts";
import type { RealtimeClientLike } from "@/lib/hooks/useRealtimeChannel";
import type { LiveAlertRow, SessionDriverInfo } from "@/lib/data/alerts";
import type { DrowsinessEvent } from "@/lib/types";

export interface LiveAlertsFeedClientProps {
  initialRows: LiveAlertRow[];
  driverInfoBySessionId: Record<string, SessionDriverInfo>;
  realtimeClient: RealtimeClientLike | null;
}

/**
 * Live alerts feed (PRD Section 8.5): realtime-subscribed to critical
 * drowsiness_events, newest first, with a per-row Acknowledge action.
 */
export function LiveAlertsFeedClient({
  initialRows,
  driverInfoBySessionId,
  realtimeClient,
}: LiveAlertsFeedClientProps) {
  const initialEvents: DrowsinessEvent[] = initialRows.map((r) => r.event);
  const events = useLiveAlerts(realtimeClient, initialEvents);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const handleAcknowledge = (eventId: string) => {
    setAcknowledged((prev) => new Set(prev).add(eventId));
  };

  if (events.length === 0) {
    return <p className="text-sm text-mist">No critical alerts. The fleet is clear.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {events.map((event) => {
        const info = driverInfoBySessionId[event.session_id];
        return (
          <AlertRow
            key={event.id}
            event={event}
            driverName={info?.driverName ?? "Unknown driver"}
            driverId={info?.driverId ?? ""}
            acknowledged={acknowledged.has(event.id)}
            onAcknowledge={handleAcknowledge}
          />
        );
      })}
    </ul>
  );
}
