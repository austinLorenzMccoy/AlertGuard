import Link from "next/link";

/**
 * Marketing landing page (PRD Section 1: "web fleet dashboard" surface's
 * public entry point). Visitors land here first; `/login` is reached via
 * the CTA below, not the root path itself.
 */
export default function RootPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="font-display text-4xl text-fog sm:text-5xl">AlertGuard</h1>
      <p className="max-w-md text-base text-mist">
        Real-time driver safety monitoring, reporting, and redemption administration
        for fleet managers and admins.
      </p>
      <Link
        href="/login"
        className="inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-btn bg-accent px-6 text-sm font-medium font-body text-ink transition-colors hover:bg-accent/90"
      >
        Log in
      </Link>
    </main>
  );
}
