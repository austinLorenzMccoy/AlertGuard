import { cache } from "react";
import { demoSeed, FLEET_ID } from "@/lib/data/demo-seed";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import type { Profile, Role } from "@/lib/types";

/**
 * Every state a request can resolve to when figuring out "which fleet is
 * this signed-in fleet manager/admin looking at". A discriminated union so
 * every branch is a distinct, individually testable case rather than a
 * nullable grab-bag.
 *
 * - `demo` — no Supabase project configured; use the in-memory demo seed
 *   (see README "Demo mode"). This is the existing, deliberately-preserved
 *   local-dev path — not a degraded/error state.
 * - `unauthenticated` — no signed-in Supabase session.
 * - `unauthorized_role` — signed in, but the profile's role is neither
 *   `fleet_manager` nor `admin` (PRD Section 8.1: drivers get bounced to
 *   `/download`). `role` is typed loosely (`Role | string`) because it comes
 *   straight off the `profiles` row at runtime — an unrecognized value must
 *   still be handled (fail closed), not just the two roles this file knows
 *   how to reject.
 * - `no_fleet` — signed in with an authorized role, but `profiles.fleet_id`
 *   is null. Judgment call (the PRD doesn't spec multi-fleet admin UX): an
 *   admin with no `fleet_id` is treated the same as a fleet_manager with no
 *   `fleet_id` — both need *some* fleet_id to view these fleet-scoped pages
 *   in v1, so both land here rather than admins getting a separate
 *   all-fleets/fleet-picker state. Revisit if/when admins need to browse
 *   across fleets.
 * - `ok` — signed in, authorized role, resolved `fleetId`.
 */
export type FleetContext =
  | { status: "demo"; fleetId: string; profile: Profile }
  | { status: "unauthenticated" }
  | { status: "unauthorized_role"; role: Role | string | null }
  | { status: "no_fleet"; profile: Profile }
  | { status: "ok"; fleetId: string; profile: Profile };

function isDemoMode(): boolean {
  return !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

function getDemoProfile(): Profile {
  // Non-null assertion: demo-seed.ts is a static, checked-in fixture that
  // always includes the "mgr-1" fleet manager (see README "Demo mode") — a
  // null-guard here would be an untestable, unreachable branch (per this
  // project's "keep coverage exclusions honest" convention).
  return demoSeed.profiles.find((p) => p.id === "mgr-1")!;
}

/**
 * Resolves the signed-in fleet manager/admin's context for the current
 * request: their profile and the `fleet_id` the dashboard should be scoped
 * to. Wrapped in React's `cache()` so the layout and a page can both call it
 * within the same request and only hit Supabase once.
 */
export const getFleetContext = cache(async (): Promise<FleetContext> => {
  if (isDemoMode()) {
    return { status: "demo", fleetId: FLEET_ID, profile: getDemoProfile() };
  }

  const supabase = createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { status: "unauthenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // No profiles row for an authenticated auth.users id is an inconsistent
  // account state (should be provisioned together) — fail closed rather
  // than let it fall through to the dashboard.
  if (!profile) {
    return { status: "unauthenticated" };
  }

  const typedProfile = profile as Profile;

  if (typedProfile.role !== "fleet_manager" && typedProfile.role !== "admin") {
    return { status: "unauthorized_role", role: typedProfile.role };
  }

  if (!typedProfile.fleet_id) {
    return { status: "no_fleet", profile: typedProfile };
  }

  return { status: "ok", fleetId: typedProfile.fleet_id, profile: typedProfile };
});

/**
 * Extracts the resolved `fleetId` from a `demo`/`ok` context, or throws.
 *
 * Every `app/(dashboard)/**` page relies on the layout (`layout.tsx`) having
 * already redirected away any `unauthenticated`/`unauthorized_role`/
 * `no_fleet` context before page content renders. Next.js doesn't guarantee
 * that ordering in every edge case, so pages call this rather than assuming
 * it — it fails loudly (throws, producing an error boundary) instead of
 * silently rendering another fleet's data or crashing on a missing id.
 */
export function requireFleetId(context: FleetContext): string {
  if (context.status === "demo" || context.status === "ok") {
    return context.fleetId;
  }
  throw new Error(
    `Fleet context is not resolved (status: "${context.status}"). This page must only ` +
      "render behind app/(dashboard)/layout.tsx, which redirects away every other status.",
  );
}
