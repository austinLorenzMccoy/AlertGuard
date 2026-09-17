// Deno wiring for `request-wallet-connect-challenge`. PRD reference: Smart
// Contract PRD Section 3 ("Wallet Model"), Section 10 Phase B item 7.
// Thin wiring only — business logic (nonce generation) lives in
// ../_shared/wallet-crypto.ts. Excluded from the coverage target; see
// backend/README.md.
//
// Issues a one-time challenge nonce a driver's external wallet (Leather/
// Xverse via sats-connect) must sign to prove ownership of an address; see
// WALLET_INTEGRATION.md for the full client-side flow this pairs with.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateChallenge } from "../_shared/wallet-crypto.ts";
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
  if (!auth.authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { driver_id } = await req.json();

  // A driver may only request a challenge for themselves.
  if (!auth.isInternal && auth.userId !== driver_id) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const { nonce, expiresAt } = generateChallenge(driver_id, Date.now());

  const { error } = await supabase.from("wallet_connect_challenges").insert({
    driver_id,
    nonce,
    expires_at: expiresAt,
  });
  if (error) {
    return new Response(JSON.stringify({ error: "challenge_creation_failed" }), { status: 500 });
  }

  return new Response(JSON.stringify({ nonce, expires_at: expiresAt }), { status: 200 });
});
