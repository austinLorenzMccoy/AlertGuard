// Deno wiring for `manage-user-role` — "promote user to fleet_manager/admin"
// from the fleet dashboard's Settings page. Thin wiring only — business logic
// lives in ../_shared/roles.ts. Excluded from the coverage target; see
// backend/README.md.
//
// Always an end-user-initiated action (a signed-in fleet_manager/admin typing
// an email into the dashboard) — there is no internal-call/shared-secret path
// for this function, unlike calculate-reward/trigger-payout/etc.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  manageUserRole,
  type CallerProfileRepo,
  type TargetUserResolver,
  type TargetProfileRepo,
  type RoleChangeAuditLogger,
  type ProfileRole,
  type TargetRole,
} from "../_shared/roles.ts";
import { authorizeCaller, type JwtVerifier } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");

const VALID_TARGET_ROLES: TargetRole[] = ["fleet_manager", "admin"];

serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const jwtVerifier: JwtVerifier = {
    async verify(token: string) {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data?.user) return null;
      return { userId: data.user.id };
    },
  };
  const auth = await authorizeCaller(req.headers, { internalSecret: INTERNAL_SECRET, jwtVerifier });
  if (!auth.authorized || !auth.userId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const role = body?.role as TargetRole | undefined;
  const fleetId: string | null | undefined = body?.fleet_id;

  if (!email || !role || !VALID_TARGET_ROLES.includes(role)) {
    return new Response(JSON.stringify({ status: "error", reason: "invalid_request" }), { status: 400 });
  }

  const callerProfiles: CallerProfileRepo = {
    findCallerProfile: async (userId) => {
      const { data } = await supabase
        .from("profiles")
        .select("role, fleet_id")
        .eq("id", userId)
        .maybeSingle();
      return data ? { role: data.role as ProfileRole, fleet_id: data.fleet_id } : null;
    },
  };

  const targetUserResolver: TargetUserResolver = {
    findUserIdByEmail: async (targetEmail) => {
      const { data } = await supabase.rpc("find_user_id_by_email", { target_email: targetEmail });
      return (data as string | null) ?? null;
    },
  };

  const targetProfiles: TargetProfileRepo = {
    findTargetProfile: async (userId) => {
      const { data } = await supabase
        .from("profiles")
        .select("role, fleet_id")
        .eq("id", userId)
        .maybeSingle();
      return data ? { role: data.role as ProfileRole, fleet_id: data.fleet_id } : null;
    },
    updateRoleAndFleet: async (userId, newRole, fleetIdToSet) => {
      await supabase.from("profiles").update({ role: newRole, fleet_id: fleetIdToSet }).eq("id", userId);
    },
  };

  const auditLogger: RoleChangeAuditLogger = {
    logRoleChange: async (entry) => {
      await supabase.from("role_change_events").insert({
        actor_id: entry.actorId,
        target_id: entry.targetId,
        old_role: entry.oldRole,
        new_role: entry.newRole,
        old_fleet_id: entry.oldFleetId,
        new_fleet_id: entry.newFleetId,
      });
    },
  };

  const result = await manageUserRole(
    { callerId: auth.userId, email, role, fleetId },
    { callerProfiles, targetUserResolver, targetProfiles, auditLogger }
  );

  if (result.status === "success") {
    return new Response(JSON.stringify(result), { status: 200 });
  }

  const statusByReason: Record<string, number> = {
    forbidden: 403,
    cannot_modify_own_role: 403,
    user_not_found: 404,
    profile_not_ready: 404,
    fleet_id_required: 400,
  };
  const status = statusByReason[result.reason] ?? 400;
  return new Response(JSON.stringify(result), { status });
});
