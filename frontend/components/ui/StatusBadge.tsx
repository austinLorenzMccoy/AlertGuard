import { SCORE_BAND_ICON, SCORE_BAND_LABEL } from "@/lib/logic/safety-score";
import type { ScoreBand } from "@/lib/types";

const BAND_CLASSES: Record<ScoreBand, string> = {
  good: "bg-[#1c3324] text-[#7fe0a0]",
  warning: "bg-[#3a2f14] text-accent",
  critical: "bg-[#3a1a17] text-[#ff9d92]",
};

export interface StatusBadgeProps {
  band: ScoreBand | null;
}

/**
 * Status is never shown by color alone (PRD Section 12): every badge pairs
 * an icon glyph with a text label.
 */
export function StatusBadge({ band }: StatusBadgeProps) {
  if (band === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-3 px-2.5 py-1 text-xs font-medium text-mist">
        <span aria-hidden="true">–</span>
        No data
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${BAND_CLASSES[band]}`}
    >
      <span aria-hidden="true">{SCORE_BAND_ICON[band]}</span>
      {SCORE_BAND_LABEL[band]}
    </span>
  );
}
