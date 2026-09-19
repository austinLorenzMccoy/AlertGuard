import type { ReactNode } from "react";

interface RewardItem {
  title: string;
  description: string;
  icon: ReactNode;
}

const REWARDS: RewardItem[] = [
  {
    title: "Airtime & data",
    description: "Redeem points instantly, no wallet needed.",
    icon: <circle cx="13" cy="13" r="10.5" />,
  },
  {
    title: "Fuel vouchers",
    description: "Built for drivers who live on the road.",
    icon: <path d="M13 3c4 5.5 6 9 6 12a6 6 0 11-12 0c0-3 2-6.5 6-12z" />,
  },
  {
    title: "Token rewards",
    description: "Settled on Stacks, for drivers who want to hold.",
    icon: (
      <>
        <polygon points="13,2 22,7.5 22,18.5 13,24 4,18.5 4,7.5" />
        <circle cx="13" cy="13" r="4" />
      </>
    ),
  },
  {
    title: "Insurance discount",
    description: "A verified score, backing a lower premium.",
    icon: (
      <>
        <circle cx="13" cy="13" r="10.5" />
        <path d="M8.5 13l3.3 3.3L18 9.5" />
      </>
    ),
  },
];

export function Rewards() {
  return (
    <section id="rewards" className="flex flex-col gap-10 border-y border-line bg-ink-2 px-6 py-20 md:px-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="font-body text-xs font-medium uppercase tracking-[0.16em] text-accent">
          Verified trips, real rewards
        </span>
        <h2 className="max-w-[640px] font-display text-3xl font-semibold text-fog sm:text-4xl">
          Safe driving pays — literally
        </h2>
        <p className="max-w-[560px] font-body text-[15px] text-mist">
          Rewards are funded by fleet and insurer subscriptions, not token printing — so every
          payout is backed by real revenue.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-12">
        {REWARDS.map((reward) => (
          <div key={reward.title} className="flex w-[200px] flex-col items-center gap-3 text-center">
            <svg
              viewBox="0 0 26 26"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-[30px] w-[30px] text-accent"
            >
              {reward.icon}
            </svg>
            <h4 className="font-display text-[17px] font-semibold text-fog">{reward.title}</h4>
            <p className="font-body text-[13.5px] text-mist">{reward.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
