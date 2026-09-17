// Pure authorization/orchestration logic for the `manage-user-role` Edge
// Function ("promote user to fleet_manager/admin" — the fleet dashboard's
// Settings page). Mirrors the DI shape of _shared/wallet.ts/_shared/rewards.ts:
// every DB read/write is injected through a small repo interface so this
// module is testable without a real Supabase client.
//
// SECURITY: manage-user-role/index.ts runs under the service-role key, which
// is explicitly exempt from the `guard_profile_self_escalation` trigger
// (20260101000004_rls_policies.sql) — that trigger only blocks self-promotion
// when `auth.role() <> 'service_role'`. That means the DB will NOT stop a
// caller from using this feature to promote themselves; this module's
// `manageUserRole` orchestration is the only thing that does, via an
// unconditional self-promotion guard that runs before any role-authorization
// branch below, regardless of the caller's current role. See the
// `cannot_modify_own_role` branch and its test coverage — do not weaken or
// reorder this check.

export type ProfileRole = "driver" | "fleet_manager" | "admin";
export type TargetRole = "fleet_manager" | "admin";

export interface CallerProfile {
  role: ProfileRole;
  fleet_id: string | null;
}

export interface TargetProfile {
  role: ProfileRole;
  fleet_id: string | null;
}

// ---------------------------------------------------------------------------
// authorizeRoleChange — pure authorization decision
// ---------------------------------------------------------------------------

export interface RoleChangeAuthorizationInput {
  /** null when the caller has no `profiles` row at all. */
  callerRole: ProfileRole | null;
  callerFleetId: string | null;
  requestedRole: TargetRole;
  requestedFleetId: string | null | undefined;
}

export type RoleChangeAuthorizationResult =
  | { allowed: true; fleetId: string | null }
  | { allowed: false; reason: "forbidden" | "fleet_id_required" };

/**
 * Decides whether `callerRole` may promote/assign a target user to
 * `requestedRole` (and with which `fleet_id`), independent of any DB access —
 * every branch here is directly unit-testable.
 *
 * Rules (see backend/README.md "manage-user-role" section for the narrative):
 *   - `driver`, or no profile row at all (`null`) -> forbidden.
 *   - `fleet_manager` -> may only grant `fleet_manager`, and the target's
 *     `fleet_id` is always forced to the caller's own `fleet_id` (whatever
 *     `fleet_id` was requested is ignored/overwritten). Requesting `admin` ->
 *     forbidden.
 *   - `admin` -> may grant `fleet_manager` (fleet_id required — an admin
 *     promoting someone to fleet_manager must say which fleet) or `admin`
 *     (fleet_id optional, passed through as given, including `null`).
 */
export function authorizeRoleChange(
  input: RoleChangeAuthorizationInput
): RoleChangeAuthorizationResult {
  const { callerRole, callerFleetId, requestedRole, requestedFleetId } = input;

  if (callerRole === null || callerRole === "driver") {
    return { allowed: false, reason: "forbidden" };
  }

  if (callerRole === "fleet_manager") {
    if (requestedRole !== "fleet_manager") {
      return { allowed: false, reason: "forbidden" };
    }
    return { allowed: true, fleetId: callerFleetId };
  }

  // callerRole === "admin"
  if (requestedRole === "fleet_manager") {
    if (!requestedFleetId) {
      return { allowed: false, reason: "fleet_id_required" };
    }
    return { allowed: true, fleetId: requestedFleetId };
  }

  // requestedRole === "admin": fleet_id is optional, pass through as given.
  return { allowed: true, fleetId: requestedFleetId ?? null };
}

// ---------------------------------------------------------------------------
// manageUserRole — orchestration
// ---------------------------------------------------------------------------

export interface CallerProfileRepo {
  findCallerProfile(userId: string): Promise<CallerProfile | null>;
}

export interface TargetUserResolver {
  /** Resolves an email to an auth.users id, or null if no account exists for it. */
  findUserIdByEmail(email: string): Promise<string | null>;
}

export interface TargetProfileRepo {
  findTargetProfile(userId: string): Promise<TargetProfile | null>;
  updateRoleAndFleet(userId: string, role: TargetRole, fleetId: string | null): Promise<void>;
}

export interface RoleChangeAuditLogger {
  logRoleChange(entry: {
    actorId: string;
    targetId: string;
    oldRole: ProfileRole;
    newRole: TargetRole;
    oldFleetId: string | null;
    newFleetId: string | null;
  }): Promise<void>;
}

export interface ManageUserRoleInput {
  callerId: string;
  email: string;
  role: TargetRole;
  fleetId?: string | null;
}

export interface ManageUserRoleDeps {
  callerProfiles: CallerProfileRepo;
  targetUserResolver: TargetUserResolver;
  targetProfiles: TargetProfileRepo;
  auditLogger: RoleChangeAuditLogger;
}

export type ManageUserRoleResult =
  | { status: "success"; targetId: string; role: TargetRole; fleetId: string | null }
  | {
      status: "error";
      reason:
        | "cannot_modify_own_role"
        | "user_not_found"
        | "profile_not_ready"
        | "forbidden"
        | "fleet_id_required";
    };

/**
 * Orchestrates a role-promotion request:
 *   1. Resolves the target email to a user id. No account for that email at
 *      all is an expected, common case (the person hasn't signed in yet) ->
 *      `user_not_found`, not a generic error.
 *   2. Self-promotion guard: if the resolved target id is the caller's own
 *      id, reject unconditionally with `cannot_modify_own_role` — BEFORE any
 *      role-authorization logic runs, regardless of the caller's current
 *      role. This is the only thing standing between this feature and a
 *      privilege-escalation hole, since the DB-level guard trigger is
 *      exempt for service-role writes (see module doc comment above).
 *   3. Resolves the caller's own `profiles` row and runs it through the pure
 *      `authorizeRoleChange` decision.
 *   4. Resolves the target's `profiles` row. Should always exist given the
 *      `handle_new_user` trigger once an `auth.users` row exists, but this
 *      does not assume that — a missing row is treated as `profile_not_ready`
 *      rather than crashing.
 *   5. On success: updates the target's role/fleet_id and writes an audit row.
 */
export async function manageUserRole(
  input: ManageUserRoleInput,
  deps: ManageUserRoleDeps
): Promise<ManageUserRoleResult> {
  const targetId = await deps.targetUserResolver.findUserIdByEmail(input.email);
  if (!targetId) {
    return { status: "error", reason: "user_not_found" };
  }

  if (targetId === input.callerId) {
    return { status: "error", reason: "cannot_modify_own_role" };
  }

  const callerProfile = await deps.callerProfiles.findCallerProfile(input.callerId);
  const decision = authorizeRoleChange({
    callerRole: callerProfile?.role ?? null,
    callerFleetId: callerProfile?.fleet_id ?? null,
    requestedRole: input.role,
    requestedFleetId: input.fleetId,
  });

  if (!decision.allowed) {
    return { status: "error", reason: decision.reason };
  }

  const targetProfile = await deps.targetProfiles.findTargetProfile(targetId);
  if (!targetProfile) {
    return { status: "error", reason: "profile_not_ready" };
  }

  await deps.targetProfiles.updateRoleAndFleet(targetId, input.role, decision.fleetId);
  await deps.auditLogger.logRoleChange({
    actorId: input.callerId,
    targetId,
    oldRole: targetProfile.role,
    newRole: input.role,
    oldFleetId: targetProfile.fleet_id,
    newFleetId: decision.fleetId,
  });

  return { status: "success", targetId, role: input.role, fleetId: decision.fleetId };
}
