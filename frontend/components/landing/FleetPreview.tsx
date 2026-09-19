import Link from "next/link";

const FLEET_ROWS = [
  { name: "Tunde A. — Route 4", score: 91 },
  { name: "Ifeoma O. — Route 1", score: 97 },
];

export function FleetPreview() {
  return (
    <section id="fleet" className="flex flex-col items-center gap-12 px-6 py-20 md:flex-row md:px-16">
      <div className="flex max-w-[460px] flex-col gap-5">
        <span className="font-body text-xs font-medium uppercase tracking-[0.16em] text-accent">
          For fleet operators
        </span>
        <h2 className="font-display text-[32px] font-semibold leading-tight text-fog sm:text-4xl">
          See it from the fleet side, live
        </h2>
        <p className="font-body text-[15.5px] leading-relaxed text-mist">
          Every verified trip streams straight to your dashboard — no polling, no waiting for
          a nightly sync. Watch safety scores, catch a critical alert the moment it fires, and
          export the data your insurer actually wants to see.
        </p>
        <Link
          href="/login"
          className="mt-1 inline-flex min-h-touch items-center justify-center self-start rounded-btn border border-accent px-[22px] font-body text-[14.5px] font-semibold text-accent transition-colors hover:bg-accent/10"
        >
          See the fleet dashboard
        </Link>
      </div>
      <div className="flex w-full flex-grow flex-col gap-[18px] rounded-[20px] border border-line bg-ink-2 p-7">
        <div className="flex items-center justify-between">
          <span className="font-display text-[17px] font-semibold text-fog">Lacoco Fleet</span>
          <div className="flex items-center gap-2 font-body text-xs text-mist">
            <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-accent" />
            Live
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {FLEET_ROWS.map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between rounded-xl bg-ink-3 px-4 py-3.5"
            >
              <span className="font-body text-sm text-fog">{row.name}</span>
              <div className="flex items-center gap-2.5">
                <div className="h-1.5 w-[100px] overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${row.score}%` }} />
                </div>
                <span className="font-body text-[13px] text-mist">{row.score}</span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-xl border border-brake/35 bg-ink-3 px-4 py-3.5">
            <span className="font-body text-sm text-fog">Bassey E. — Route 7</span>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} className="h-3.5 w-3.5 text-brake">
                <path d="M8 4v5" strokeLinecap="round" />
                <circle cx="8" cy="11.4" r="0.8" fill="currentColor" stroke="none" />
              </svg>
              <span className="font-body text-[13px] text-brake">Critical alert</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
