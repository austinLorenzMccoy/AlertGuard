"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { getPostLoginRedirect } from "@/lib/logic/auth-redirect";
import type { Role } from "@/lib/types";

const DEMO_ROLES: { value: Role; label: string }[] = [
  { value: "fleet_manager", label: "Fleet manager (demo)" },
  { value: "admin", label: "Admin (demo)" },
  { value: "driver", label: "Driver (demo)" },
];

/**
 * Login screen (PRD Section 8.1). Real Google OAuth via Supabase Auth is not
 * wired in this build (see README) — the role selector below stands in for
 * "the role Supabase would return on the session" so the redirect logic is
 * exercisable end-to-end without a real OAuth provider.
 */
export function LoginClient() {
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
