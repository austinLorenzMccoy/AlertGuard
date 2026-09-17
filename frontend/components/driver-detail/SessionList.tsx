"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { DrivingSession, DrowsinessEvent } from "@/lib/types";

export interface SessionListProps {
  sessions: DrivingSession[];
  events: DrowsinessEvent[];
}

/** Session list with expandable event timeline (PRD Section 8.4). */
export function SessionList({ sessions, events }: SessionListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return <p className="text-sm text-mist">No sessions yet.</p>;
  }

  const sorted = [...sessions].sort((a, b) => b.start_time.localeCompare(a.start_time));

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((session) => {
        const isExpanded = expandedId === session.id;
        const sessionEvents = events.filter((e) => e.session_id === session.id);
        return (
          <li key={session.id} className="rounded-card border border-line bg-ink-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col">
                <span className="text-sm text-fog">
                  {new Date(session.start_time).toLocaleDateString()}
                </span>
                <span className="text-xs text-mist">
                  {session.distance_km ?? 0} km · score {session.safety_score ?? "—"} ·{" "}
                  {session.status}
                </span>
              </div>
              <Button
                variant="secondary"
                aria-expanded={isExpanded}
                onClick={() => setExpandedId(isExpanded ? null : session.id)}
              >
                {isExpanded ? "Hide events" : `Events (${sessionEvents.length})`}
              </Button>
            </div>
            {isExpanded && (
              <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
                {sessionEvents.length === 0 && (
                  <li className="text-xs text-mist">No drowsiness events logged.</li>
                )}
                {sessionEvents.map((event) => (
                  <li key={event.id} className="flex items-center gap-2 text-xs text-fog">
                    <span aria-hidden="true">
                      {event.severity === "critical" ? "✕" : event.severity === "vibration" ? "!" : "·"}
                    </span>
                    <span>{event.event_type}</span>
                    <span className="text-mist">({event.severity})</span>
                    <span className="text-mist">
                      {new Date(event.occurred_at).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
