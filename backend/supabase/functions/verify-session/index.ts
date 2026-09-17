// Deno wiring for `verify-session`. PRD reference: Backend PRD Section 10.1.
//
// This file is intentionally thin: it does only Deno-specific things
// (serve(), Deno.env.get(), the Supabase client, the internal fetch chain
// into calculate-reward) and delegates all business logic to
// `../_shared/verification.ts`, which is plain, dependency-free TypeScript
// covered by Vitest under Node. This file cannot run outside Deno and is
// excluded from the coverage target — see backend/README.md.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifySession } from "../_shared/verification.ts";
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

  const auth = await authorizeCaller(req.headers, {
    internalSecret: INTERNAL_SECRET,
    jwtVerifier,
  });
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { session_id } = await req.json();

  const { data: session, error } = await supabase
    .from("driving_sessions")
    .select("*, devices(*)")
    .eq("id", session_id)
    .single();

  if (error || !session) {
    return new Response(JSON.stringify({ error: "session_not_found" }), { status: 404 });
  }

  const result = verifySession({ session, device: session.devices });

  await supabase.from("session_verifications").insert({
    session_id,
    gps_continuity_ok: result.gpsContinuityOk,
    device_attestation_ok: result.deviceAttestationOk,
    timestamp_consistency_ok: result.timestampConsistencyOk,
    verification_status: result.passed ? "passed" : "failed",
    verified_at: new Date().toISOString(),
  });

  if (result.passed) {
    await supabase.from("driving_sessions").update({ status: "verified" }).eq("id", session_id);

    // chain into reward calculation (internal call: service role + shared secret)
    await fetch(`${SUPABASE_URL}/functions/v1/calculate-reward`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "x-internal-secret": INTERNAL_SECRET ?? "",
      },
      body: JSON.stringify({ session_id }),
    });
  }

  return new Response(JSON.stringify({ passed: result.passed }), { status: 200 });
});
