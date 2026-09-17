import { classifyScoreBand } from "@/lib/logic/safety-score";

const BAND_BAR_CLASSES = {
  good: "bg-[#7fe0a0]",
  warning: "bg-accent",
  critical: "bg-brake",
} as const;

export interface ScoreBarProps {
  score: number | null;
}

/** Safety-score bar: numeric label always shown alongside the fill (never color-alone). */
export function ScoreBar({ score }: ScoreBarProps) {
  const band = classifyScoreBand(score);
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));

  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-valuenow={score ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Safety score"
        className="h-2 w-24 overflow-hidden rounded-full bg-ink-3"
      >
        <div
          className={`h-full rounded-full ${band ? BAND_BAR_CLASSES[band] : "bg-mist"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-display text-sm text-fog">
        {score === null ? "—" : Math.round(score)}
      </span>
    </div>
  );
}
