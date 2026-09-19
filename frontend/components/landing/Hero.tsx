import Link from "next/link";
import { CheckIcon } from "@/components/landing/icons";

const TRUST_BULLETS = ["Works fully offline", "No video leaves your phone", "Naira + token rewards"];

/**
 * The illustrated dusk-highway scene behind the hero's floating cards —
 * gradient sky, a scatter of stars, layered road/hill silhouettes, a
 * receding center-line, and a pair of amber headlight-glow ellipses. Pure
 * SVG (from the AlertGuard landing design canvas), no photo asset.
 */
function DuskHighwayIllustration() {
  return (
    <svg viewBox="0 0 700 640" preserveAspectRatio="xMidYMax slice" className="h-full w-full">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0B0F1A" />
          <stop offset="55%" stopColor="#171F33" />
          <stop offset="100%" stopColor="#2A2440" />
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#F2A93B" stopOpacity={0.55} />
          <stop offset="100%" stopColor="#F2A93B" stopOpacity={0} />
        </radialGradient>
      </defs>
      <rect width="700" height="640" fill="url(#sky)" />
      <g fill="#EDE7DB" opacity={0.55}>
        <circle cx="90" cy="70" r="1.4" />
        <circle cx="220" cy="40" r="1" />
        <circle cx="340" cy="90" r="1.3" />
        <circle cx="480" cy="50" r="1" />
        <circle cx="600" cy="80" r="1.5" />
        <circle cx="150" cy="130" r="1" />
        <circle cx="520" cy="140" r="1.2" />
        <circle cx="640" cy="160" r="1" />
      </g>
      <polygon points="0,400 120,300 260,380 420,270 560,370 700,310 700,640 0,640" fill="#141B2E" />
      <polygon points="0,460 180,390 380,450 560,370 700,430 700,640 0,640" fill="#0E1424" />
      <polygon points="290,640 410,640 365,380 335,380" fill="#1B2338" />
      <g stroke="#EDE7DB" strokeWidth={6} strokeLinecap="round" opacity={0.65}>
        <line x1="349" y1="640" x2="350" y2="470" />
        <line x1="349" y1="430" x2="350" y2="380" />
      </g>
      <ellipse cx="315" cy="520" rx="150" ry="85" fill="url(#glow)" />
      <ellipse cx="385" cy="520" rx="150" ry="85" fill="url(#glow)" />
      <rect x="0" y="360" width="700" height="130" fill="#EDE7DB" opacity={0.05} />
    </svg>
  );
}

function SafetyScoreGauge() {
  return (
    <svg viewBox="0 0 120 120" className="h-[104px] w-[104px]">
      <circle cx="60" cy="60" r="50" fill="none" stroke="rgba(237,231,219,0.14)" strokeWidth={10} />
      <circle
        cx="60"
        cy="60"
        r="50"
        fill="none"
        stroke="#F2A93B"
        strokeWidth={10}
        strokeLinecap="round"
        strokeDasharray={314}
        strokeDashoffset={19}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="68" textAnchor="middle" fontFamily="Fraunces, serif" fontSize={32} fill="#EDE7DB">
        94
      </text>
    </svg>
  );
}

export function Hero() {
  return (
    <section className="flex flex-col items-center gap-14 px-6 py-16 md:min-h-[700px] md:flex-row md:px-16 md:py-0">
      <div className="flex max-w-[540px] flex-col gap-6">
        <span className="font-body text-xs font-medium uppercase tracking-[0.16em] text-accent">
          Verified safe driving
        </span>
        <h1 className="font-display text-4xl font-semibold leading-[1.08] text-fog sm:text-5xl lg:text-[60px]">
          Stay awake at the wheel.
          <br />
          <span className="italic text-accent">Get paid</span> for it.
        </h1>
        <p className="max-w-[460px] font-body text-[17px] leading-relaxed text-mist">
          AlertGuard watches for the signs of fatigue right on your phone, verifies every safe
          trip, and turns it into naira, fuel, or token rewards — no dash cam, no extra
          hardware.
        </p>
        <div className="flex flex-wrap gap-3.5 pt-1">
          <Link
            href="/download"
            className="inline-flex min-h-touch items-center justify-center rounded-btn bg-accent px-6 font-body text-[15px] font-semibold text-ink transition-colors hover:bg-accent/90"
          >
            Download the app
          </Link>
          <Link
            href="/login"
            className="inline-flex min-h-touch items-center justify-center rounded-btn border border-line px-6 font-body text-[15px] font-semibold text-fog transition-colors hover:bg-ink-2"
          >
            For fleets &amp; insurers
          </Link>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-6 border-t border-line pt-5">
          {TRUST_BULLETS.map((label) => (
            <div key={label} className="flex items-center gap-2 font-body text-[13px] text-mist">
              <CheckIcon className="h-[15px] w-[15px] shrink-0 text-accent" />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="relative h-[420px] w-full flex-grow overflow-hidden rounded-[24px] border border-line sm:h-[520px] md:h-[640px]">
        <DuskHighwayIllustration />

        <div className="absolute right-9 top-9 flex w-[220px] flex-col items-center gap-1.5 rounded-2xl border border-line bg-ink/[0.62] p-5 backdrop-blur-[6px]">
          <span className="font-body text-[11.5px] uppercase tracking-[0.1em] text-mist">
            Safety score
          </span>
          <SafetyScoreGauge />
          <div className="flex items-center gap-1.5 font-body text-xs text-mist">
            <CheckIcon className="h-[13px] w-[13px] shrink-0 text-accent" />
            Trip verified
          </div>
        </div>

        <div className="absolute bottom-7 left-7 flex items-center gap-2.5 rounded-full border border-line bg-ink/[0.55] px-4 py-2.5 backdrop-blur-[6px]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
          <span className="font-body text-[12.5px] text-fog">Lagos → Ikeja · 22 min in</span>
        </div>
      </div>
    </section>
  );
}
