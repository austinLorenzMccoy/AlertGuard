import type { ScoreBand } from "@/lib/types";

/**
 * Safety-score band thresholds.
 *
 * The PRD does not specify exact cutoffs, so these are a documented product
 * choice, not a backend contract:
 *   - good:     score >= 80  (matches the "verified safe driving" bar used
 *                             for reward eligibility framing on the landing
 *                             page hero card)
 *   - warning:  60 <= score < 80 (needs attention, not yet critical)
 *   - critical: score < 60  (fleet manager should intervene)
 *
 * Null/undefined scores (session in progress, no data yet) are treated as
 * "unknown" rather than forced into a band — callers should render a neutral
 * state instead of implying a good/bad score.
 */
export const SCORE_BAND_THRESHOLDS = {
  good: 80,
  warning: 60,
} as const;

export function classifyScoreBand(score: number | null | undefined): ScoreBand | null {
  if (score === null || score === undefined || Number.isNaN(score)) return null;
  if (score >= SCORE_BAND_THRESHOLDS.good) return "good";
  if (score >= SCORE_BAND_THRESHOLDS.warning) return "warning";
  return "critical";
}

export const SCORE_BAND_LABEL: Record<ScoreBand, string> = {
  good: "Good",
  warning: "Warning",
  critical: "Critical",
};

/** Icon glyph paired with each band so status is never color-alone (PRD Section 12). */
export const SCORE_BAND_ICON: Record<ScoreBand, string> = {
  good: "✓",
  warning: "!",
  critical: "✕",
};
