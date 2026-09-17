"use client";

import { useState } from "react";
import {
  useRealtimeSubscription,
  type RealtimeClientLike,
} from "@/lib/hooks/useRealtimeChannel";
import type { DriverGridCard, DrivingSession } from "@/lib/types";

/**
 * Overview live driver grid subscription (PRD Section 8.2: "Realtime-
 * subscribed — no refresh button, updates stream in"). Subscribes to all
 * `driving_sessions` changes and patches the matching driver's card in place
 * — no polling, no manual refresh.
 */
export function useLiveDriverGrid(
  client: RealtimeClientLike | null,
  initialCards: DriverGridCard[],
): DriverGridCard[] {
  const [cards, setCards] = useState<DriverGridCard[]>(initialCards);

  useRealtimeSubscription<DrivingSession>(
    client,
    { channelName: "fleet-driver-grid", table: "driving_sessions", event: "*" },
    (session) => {
      setCards((prev) =>
        prev.map((card) => {
          if (card.driver.id !== session.driver_id) return card;
          const isLive = session.status === "active";
          return {
            ...card,
            activeSession: isLive ? session : null,
            currentScore: session.safety_score ?? card.currentScore,
            isLive,
          };
        }),
      );
    },
  );

  return cards;
}
