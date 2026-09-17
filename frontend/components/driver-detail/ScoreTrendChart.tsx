import type { TrendPoint } from "@/lib/logic/trend";

export interface ScoreTrendChartProps {
  points: TrendPoint[];
}

const WIDTH = 560;
const HEIGHT = 160;
const PADDING = 24;

/** Hand-rolled SVG line chart for the driver detail 30-day score trend (PRD Section 8.4). */
export function ScoreTrendChart({ points }: ScoreTrendChartProps) {
  const known = points.filter((p) => p.score !== null);

  if (known.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-card border border-line bg-ink-2 text-sm text-mist">
        No sessions in this period
      </div>
    );
  }

  const scores = known.map((p) => p.score as number);
  // Floor/ceiling of 0/100 are always included, so range is always >= 100
  // (never zero) — no need for a divide-by-zero fallback here.
  const min = Math.min(...scores, 0);
  const max = Math.max(...scores, 100);
  const range = max - min;
  const innerWidth = WIDTH - PADDING * 2;
  const innerHeight = HEIGHT - PADDING * 2;
  const stepX = innerWidth / Math.max(points.length - 1, 1);

  const coords: string[] = [];
  points.forEach((p, i) => {
    if (p.score === null) return;
    const x = PADDING + i * stepX;
    const y = PADDING + innerHeight - ((p.score - min) / range) * innerHeight;
    coords.push(`${x},${y}`);
  });

  return (
    <svg
      role="img"
      aria-label={`Safety score trend over ${points.length} days, latest score ${scores[scores.length - 1]}`}
      width="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="rounded-card border border-line bg-ink-2"
    >
      <line
        x1={PADDING}
        y1={PADDING + innerHeight}
        x2={WIDTH - PADDING}
        y2={PADDING + innerHeight}
        stroke="var(--line)"
      />
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="#F2A93B"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
