/**
 * Pure redirect-decision logic for `middleware.ts`. Kept separate from the
 * middleware wiring (which has to construct a real Supabase SSR client
 * against `NextRequest`/`NextResponse`) so this — the actual "should we
 * redirect" decision — is unit-tested directly, not through a simulated
 * Next.js request/response pipeline.
 *
 * Deliberately does NOT do role-based (driver vs fleet_manager/admin)
 * checking: that requires a `profiles` table lookup, which belongs in
 * `app/(dashboard)/layout.tsx` (via `lib/auth/fleet-context.ts`), not here.
 * Middleware only gates "is there a session at all" — see PRD Section 8.1.
 */

const DASHBOARD_PATH_PREFIXES = [
  "/overview",
  "/drivers",
  "/alerts",
  "/reports",
  "/redemptions",
  "/settings",
];

/** True for any dashboard route, including nested ones like `/drivers/:id`. */
export function isDashboardPath(pathname: string): boolean {
  return DASHBOARD_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Given whether the visitor has an active session and the path they're
 * requesting, returns the path to redirect to, or `null` to let the request
 * through unmodified.
 */
export function getMiddlewareRedirect(
  isAuthenticated: boolean,
  pathname: string,
): string | null {
  if (!isAuthenticated && isDashboardPath(pathname)) {
    return "/login";
  }
  return null;
}
