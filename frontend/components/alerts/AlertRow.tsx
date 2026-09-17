import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { DrowsinessEvent } from "@/lib/types";

export interface AlertRowProps {
  event: DrowsinessEvent;
  driverName: string;
  driverId: string;
  acknowledged: boolean;
  onAcknowledge: (eventId: string) => void;
}

/** One row in the live alerts feed (PRD Section 8.5). */
export function AlertRow({ event, driverName, driverId, acknowledged, onAcknowledge }: AlertRowProps) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-ink-2 p-4">
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-sm font-medium text-fog">
          <span aria-hidden="true" className="text-brake">
            ✕
          </span>
          {driverName} — {event.event_type.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-mist">{new Date(event.occurred_at).toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={`/drivers/${driverId}`}
          className="text-xs text-accent underline-offset-2 hover:underline"
        >
          View driver
        </Link>
        <Button
          variant={acknowledged ? "secondary" : "primary"}
          disabled={acknowledged}
          onClick={() => onAcknowledge(event.id)}
        >
          {acknowledged ? "Acknowledged" : "Acknowledge"}
        </Button>
      </div>
    </li>
  );
}
