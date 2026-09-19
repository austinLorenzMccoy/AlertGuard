import Link from "next/link";

/**
 * Marketing landing page (PRD Section 1: "web fleet dashboard" surface's
 * public entry point). Visitors land here first; `/login` is reached via
 * the CTA below, not the root path itself.
 */
export default function RootPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 p-6">
      <div className="flex max-w-xl flex-col items-center gap-4 text-center">
        <h1 className="font-display text-4xl text-fog sm:text-5xl">AlertGuard</h1>
        <p className="font-display text-xl text-fog sm:text-2xl">
          Verified-safe-driving detection, with an on-chain incentive layer.
        </p>
        <p className="max-w-md text-base text-mist">
          On-device drowsiness detection turns safe driving into a redeemable reward.
          Fleet managers and insurers get real-time, verified safety data — not
          self-reported claims.
        </p>
      </div>
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-line bg-ink-2 p-8 text-center">
        <h2 className="font-display text-lg text-fog">Fleet dashboard</h2>
        <p className="text-sm text-mist">
          Sign in to monitor driver safety, review alerts, and manage redemptions for
          your fleet.
        </p>
        <Link
          href="/login"
          className="inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-btn bg-accent px-6 text-sm font-medium font-body text-ink transition-colors hover:bg-accent/90"
        >
          Log in
        </Link>
      </div>
    </main>
  );
}
