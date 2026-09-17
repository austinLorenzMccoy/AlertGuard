import { DriverCard } from "@/components/overview/DriverCard";
import type { DriverGridCard } from "@/lib/types";

export interface DriverGridProps {
  cards: DriverGridCard[];
}

/** Presentational live driver grid — receives already-live-updated cards as props. */
export function DriverGrid({ cards }: DriverGridProps) {
  if (cards.length === 0) {
    return <p className="text-sm text-mist">No drivers in this fleet yet.</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <DriverCard key={card.driver.id} card={card} />
      ))}
    </div>
  );
}
