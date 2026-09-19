import Link from "next/link";

export function SplitCta() {
  return (
    <section className="flex flex-col gap-6 px-6 py-16 md:flex-row md:px-16">
      <div className="flex flex-grow flex-col gap-4 rounded-[20px] border border-accent/30 bg-gradient-to-br from-accent/10 to-accent/[0.02] p-10">
        <h3 className="font-display text-2xl font-semibold text-fog">Driving for a living?</h3>
        <p className="max-w-[380px] font-body text-[14.5px] text-mist">
          Download AlertGuard, mount your phone, and start turning safe trips into real
          rewards.
        </p>
        <Link
          href="/download"
          className="mt-1.5 inline-flex min-h-touch items-center justify-center self-start rounded-btn bg-accent px-6 font-body text-[14.5px] font-semibold text-ink transition-colors hover:bg-accent/90"
        >
          Download the app
        </Link>
      </div>
      <div className="flex flex-grow flex-col gap-4 rounded-[20px] border border-line bg-ink-2 p-10">
        <h3 className="font-display text-2xl font-semibold text-fog">
          Running a fleet, or writing cover?
        </h3>
        <p className="max-w-[380px] font-body text-[14.5px] text-mist">
          Get verified safety data on every driver, and a dashboard your team will actually
          check.
        </p>
        <Link
          href="/login"
          className="mt-1.5 inline-flex min-h-touch items-center justify-center self-start rounded-btn border border-line px-6 font-body text-[14.5px] font-semibold text-fog transition-colors hover:bg-ink-3"
        >
          Talk to us
        </Link>
      </div>
    </section>
  );
}
