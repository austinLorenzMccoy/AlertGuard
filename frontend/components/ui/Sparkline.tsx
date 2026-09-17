export interface SparklineProps {
  points: (number | null)[];
  width?: number;
  height?: number;
  label?: string;
}

/** Hand-rolled SVG sparkline — no charting dependency needed for a 7-day trend. */
export function Sparkline({ points, width = 96, height = 28, label = "Trend" }: SparklineProps) {
  const known = points.filter((p): p is number => p !== null);

  if (known.length === 0) {
    return (
      <span className="text-xs text-mist" aria-label={`${label}: no data`}>
        No data
      </span>
    );
  }

  const min = Math.min(...known);
  const max = Math.max(...known);
  const range = max - min || 1;
  const stepX = width / Math.max(points.length - 1, 1);

  const coords: string[] = [];
  points.forEach((p, i) => {
    if (p === null) return;
    const x = i * stepX;
    const y = height - ((p - min) / range) * height;
    coords.push(`${x},${y}`);
  });

  return (
    <svg
      role="img"
      aria-label={`${label}: ${known.join(", ")}`}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="text-accent"
    >
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
