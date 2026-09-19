// Deno wiring for `list-promotable-users` — powers the Settings page's user
// picker (browse signed-up accounts to promote, instead of typing an email
// blind). Thin wiring only — business logic lives in ../_shared/roles.ts.
// Excluded from the coverage target; see backend/README.md.
//
// Always an end-user-initiated action (a signed-in fleet_manager/admin
// opening the Settings page) — there is no internal-call/shared-secret path
// for this function, same as manage-user-role.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  listPromotableUsers,
  type AllUsersRepo,
  type CallerProfileRepo,
  type ProfileRole,
  type PromotableUser,
} from "../_shared/roles.ts";
import { authorizeCaller, type JwtVerifier } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");

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

  const allUsers: AllUsersRepo = {
    // auth.users isn't exposed via PostgREST, so emails come from the
    // service-role-only Admin API rather than a `profiles` join. perPage=1000
    // is a single-page fetch, sufficient for this app's fleet-scale user
    // counts today; revisit with real pagination if that stops being true.
    listAllUsers: async () => {
      const [{ data: authData }, { data: profileRows }] = await Promise.all([
        supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
        supabase.from("profiles").select("id, full_name, role, fleet_id"),
      ]);

      const emailById = new Map((authData?.users ?? []).map((u) => [u.id, u.email ?? ""]));

      return (profileRows ?? []).map(
        (p): PromotableUser => ({
          id: p.id,
          email: emailById.get(p.id) ?? "",
          fullName: p.full_name,
          role: p.role as ProfileRole,
          fleetId: p.fleet_id,
        })
      );
    },
  };

  const result = await listPromotableUsers(auth.userId, { callerProfiles, allUsers });

  if (result.status === "success") {
    return new Response(JSON.stringify(result), { status: 200 });
  }

  return new Response(JSON.stringify(result), { status: 403 });
});
