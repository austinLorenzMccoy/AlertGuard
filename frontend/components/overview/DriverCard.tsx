import Link from "next/link";
import { ScoreBar } from "@/components/ui/ScoreBar";
import type { DriverGridCard } from "@/lib/types";

export interface DriverCardProps {
  card: DriverGridCard;
}

/** One driver tile in the Overview live grid (PRD Section 8.2). */
export function DriverCard({ card }: DriverCardProps) {
  const { driver, currentScore, isLive } = card;

  return (
    <Link
      href={`/drivers/${driver.id}`}
      className="flex flex-col gap-3 rounded-card border border-line bg-ink-2 p-4 transition-colors hover:border-accent/60"
    >
      <div className="flex items-center justify-between">
        <span className="font-body text-sm font-medium text-fog">
          {driver.full_name ?? "Unnamed driver"}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-mist">
          {isLive && (
            <span
              aria-hidden="true"
              className="h-2 w-2 rounded-full bg-[#7fe0a0]"
            />
          )}
          {isLive ? "Trip active" : "Offline"}
        </span>
      </div>
      <ScoreBar score={currentScore} />
    </Link>
  );
}
