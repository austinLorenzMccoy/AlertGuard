export default function DownloadPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="font-display text-3xl text-fog">Get the AlertGuard driver app</h1>
      <p className="max-w-md text-sm text-mist">
        This account is registered as a driver. The fleet dashboard is for fleet
        managers and admins — download the AlertGuard app for Android to see your
        safety score, alerts, and rewards.
      </p>
      <a
        href="https://play.google.com/store"
        className="inline-flex min-h-touch min-w-touch items-center justify-center rounded-btn bg-accent px-5 text-sm font-medium text-ink hover:bg-accent/90"
      >
        Download on Google Play
      </a>
    </main>
  );
}
