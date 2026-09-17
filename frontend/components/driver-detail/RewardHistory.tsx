import type { Reward } from "@/lib/types";

export interface RewardHistoryProps {
  rewards: Reward[];
}

const STATUS_ICON: Record<Reward["status"], string> = {
  pending: "…",
  settled: "✓",
  failed: "✕",
};

/** Reward history for this driver (PRD Section 8.4). */
export function RewardHistory({ rewards }: RewardHistoryProps) {
  if (rewards.length === 0) {
    return <p className="text-sm text-mist">No rewards earned yet.</p>;
  }

  const sorted = [...rewards].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <ul className="flex flex-col gap-2">
      {sorted.map((reward) => (
        <li
          key={reward.id}
          className="flex items-center justify-between rounded-card border border-line bg-ink-2 p-3 text-sm"
        >
          <span className="text-fog">{reward.points_earned ?? 0} pts</span>
          <span className="text-mist">{new Date(reward.created_at).toLocaleDateString()}</span>
          <span className="flex items-center gap-1 text-fog">
            <span aria-hidden="true">{STATUS_ICON[reward.status]}</span>
            {reward.status}
          </span>
        </li>
      ))}
    </ul>
  );
}
