import { LogoMark } from "@/components/brand/LogoMark";

export default function DownloadPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <LogoMark size={40} priority />
      <h1 className="font-display text-3xl text-fog">Get the AlertGuard driver app</h1>
      <p className="max-w-md text-sm text-mist">
        This account is registered as a driver. The fleet dashboard is for fleet
        managers and admins — the AlertGuard app for Android will show your safety
        score, alerts, and rewards.
      </p>
      {/*
        No Play Store listing exists yet — the mobile app hasn't shipped
        (see mobile/README.md). A disabled button is the honest state here;
        a live link to the Play Store's generic homepage would be
        misleading. Swap this back to a real <a href> once there's an
        actual listing to point at.
      */}
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="inline-flex min-h-touch min-w-touch cursor-not-allowed items-center justify-center rounded-btn bg-accent/50 px-5 text-sm font-medium text-ink/70"
      >
        Coming soon to Google Play
      </button>
    </main>
  );
}
