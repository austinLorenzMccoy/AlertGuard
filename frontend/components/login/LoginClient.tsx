"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getPostLoginRedirect } from "@/lib/logic/auth-redirect";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { Role } from "@/lib/types";

const DEMO_ROLES: { value: Role; label: string }[] = [
  { value: "fleet_manager", label: "Fleet manager (demo)" },
  { value: "admin", label: "Admin (demo)" },
  { value: "driver", label: "Driver (demo)" },
];

/**
 * True when this build is wired to a real Supabase project (same check as
 * `lib/data/get-data-source.ts`'s demo-mode fallback, mirrored here because
 * this is a client component and can only see `NEXT_PUBLIC_*` env vars).
 */
function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Login screen (PRD Section 8.1). When a real Supabase project is configured
 * (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` set), this
 * renders a real "Continue with Google" button that starts the Supabase
 * Auth OAuth flow. `app/auth/callback/route.ts` completes the flow and
 * `app/(dashboard)/layout.tsx` does the role-based redirect once signed in.
 *
 * Without those env vars (local dev with no Supabase project — see README
 * "Demo mode"), the demo role selector stands in for "the role Supabase
 * would return on the session" so the redirect logic
 * (`lib/logic/auth-redirect.ts`) is still exercisable end-to-end.
 */
export function LoginClient() {
  if (isSupabaseConfigured()) {
    return <RealLoginClient />;
  }
  return <DemoLoginClient />;
}

function RealLoginClient() {
  const handleContinue = async () => {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-line bg-ink-2 p-8">
      <h1 className="font-display text-2xl text-fog">AlertGuard Fleet Dashboard</h1>
      <p className="text-sm text-mist">
        Sign in with your fleet Google account. Driver accounts are redirected to the
        mobile app download page.
      </p>
      <Button variant="primary" onClick={handleContinue}>
        Continue with Google
      </Button>
    </div>
  );
}

function DemoLoginClient() {
  const router = useRouter();
  const [demoRole, setDemoRole] = useState<Role>("fleet_manager");

  const handleContinue = () => {
    router.push(getPostLoginRedirect(demoRole));
  };

  return (
    <div className="flex w-full max-w-sm flex-col gap-4 rounded-card border border-line bg-ink-2 p-8">
      <h1 className="font-display text-2xl text-fog">AlertGuard Fleet Dashboard</h1>
      <p className="text-sm text-mist">
        Sign in with your fleet Google account. Driver accounts are redirected to the
        mobile app download page.
      </p>
      <label className="flex flex-col gap-1 text-sm text-mist" htmlFor="demo-role">
        Demo role (stands in for the OAuth session role)
        <select
          id="demo-role"
          value={demoRole}
          onChange={(e) => setDemoRole(e.target.value as Role)}
          className="min-h-touch rounded-btn border border-line bg-ink-3 px-2 text-fog"
        >
          {DEMO_ROLES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>
      <Button variant="primary" onClick={handleContinue}>
        Continue with Google
      </Button>
    </div>
  );
}
