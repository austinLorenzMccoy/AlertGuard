export interface TopStripProps {
  fleetName: string;
  activeDriversNow: number;
  todayAvgScore: number | null;
  todayCriticalAlertCount: number;
}

/** Overview top strip (PRD Section 8.2). */
export function TopStrip({
  fleetName,
  activeDriversNow,
  todayAvgScore,
  todayCriticalAlertCount,
}: TopStripProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
      <Stat label="Fleet" value={fleetName} />
      <Stat label="Active drivers now" value={String(activeDriversNow)} />
      <Stat
        label="Today's average score"
        value={todayAvgScore === null ? "—" : Math.round(todayAvgScore).toString()}
      />
      <Stat
        label="Today's critical alerts"
        value={String(todayCriticalAlertCount)}
        emphasis={todayCriticalAlertCount > 0}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-card border border-line bg-ink-2 p-4">
      <p className="text-xs text-mist">{label}</p>
      <p className={`font-display text-2xl ${emphasis ? "text-brake" : "text-fog"}`}>{value}</p>
    </div>
  );
}
