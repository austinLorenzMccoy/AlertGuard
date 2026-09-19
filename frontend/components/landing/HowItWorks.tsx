import type { ReactNode } from "react";

interface DetectionFeature {
  title: string;
  description: string;
  icon: ReactNode;
}

const DETECTION_FEATURES: DetectionFeature[] = [
  {
    title: "Eye closure",
    description: "Tracks blink duration and catches the first signs of a microsleep before it happens.",
    icon: (
      <>
        <path d="M4 14c3-5 7-7.5 10-7.5s7 2.5 10 7.5c-3 5-7 7.5-10 7.5S7 19 4 14z" />
        <circle cx="14" cy="14" r="3.2" />
      </>
    ),
  },
  {
    title: "Yawn frequency",
    description: "A rising yawn rate is an early fatigue signal, picked up well before the road gets dangerous.",
    icon: (
      <>
        <ellipse cx="14" cy="15" rx="7" ry="8.5" />
        <ellipse cx="14" cy="17" rx="3.2" ry="4" />
      </>
    ),
  },
  {
    title: "Head-nod drift",
    description: "Watches head pitch for the slow drop that comes right before a driver's eyes do.",
    icon: (
      <>
        <circle cx="13" cy="7.5" r="3.6" />
        <path d="M8.5 13c-2.2 2-2.2 6.5 1 8.6M9.5 21.6l3-2-1-3.2" />
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="how" className="flex flex-col gap-11 px-6 py-20 md:px-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="font-body text-xs font-medium uppercase tracking-[0.16em] text-accent">
          On-device detection
        </span>
        <h2 className="font-display text-3xl font-semibold text-fog sm:text-[38px]">
          Three signals, read in real time
        </h2>
      </div>
      <div className="flex flex-col justify-center gap-7 md:flex-row">
        {DETECTION_FEATURES.map((feature) => (
          <div
            key={feature.title}
            className="flex w-full flex-col gap-4 rounded-[18px] border border-line bg-ink-2 p-8 md:w-[380px]"
          >
            <svg
              viewBox="0 0 28 28"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[30px] w-[30px] text-fog"
            >
              {feature.icon}
            </svg>
            <h3 className="font-display text-xl font-semibold text-fog">{feature.title}</h3>
            <p className="font-body text-[14.5px] leading-relaxed text-mist">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
