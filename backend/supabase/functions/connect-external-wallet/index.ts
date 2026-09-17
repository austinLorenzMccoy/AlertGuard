// Deno wiring for `connect-external-wallet`. PRD reference: Smart Contract
// PRD Section 3 ("Wallet Model"), Section 10 Phase B item 7.
// Thin wiring only — business logic lives in ../_shared/wallet.ts (which in
// turn calls ../_shared/wallet-crypto.ts's verifyWalletOwnership). Excluded
// from the coverage target; see backend/README.md.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { connectExternalWallet, type WalletConnectRepo } from "../_shared/wallet.ts";
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

  const { driver_id, address, nonce, signature } = await req.json();

  // A driver may only connect a wallet to their own profile.
  if (!auth.isInternal && auth.userId !== driver_id) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const repo: WalletConnectRepo = {
    findChallenge: async (driverId, challengeNonce) => {
      // Not filtered by consumed_at here — the pure orchestration logic
      // (_shared/wallet.ts) needs to see an already-consumed row to return
      // the more specific "challenge_already_consumed" error rather than a
      // generic "challenge_not_found".
      const { data } = await supabase
        .from("wallet_connect_challenges")
        .select("*")
        .eq("driver_id", driverId)
        .eq("nonce", challengeNonce)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
    consumeChallenge: async (challengeId) => {
      await supabase
        .from("wallet_connect_challenges")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", challengeId);
    },
    updateWalletAddress: async (driverId, newAddress) => {
      await supabase.from("profiles").update({ wallet_address: newAddress }).eq("id", driverId);
    },
    findWalletKey: async (driverId) => {
      const { data } = await supabase
        .from("wallet_keys")
        .select("wallet_type")
        .eq("driver_id", driverId)
        .maybeSingle();
      return data ?? null;
    },
    deleteWalletKey: async (driverId) => {
      // Deletes AlertGuard's copy of the driver's custodial key (PRD Section
      // 3 step 4c) — only ever called by _shared/wallet.ts when the
      // existing row's wallet_type is 'custodial'.
      await supabase.from("wallet_keys").delete().eq("driver_id", driverId);
    },
    logEvent: async (driverId, eventType, metadata) => {
      await supabase.from("wallet_events").insert({ driver_id: driverId, event_type: eventType, metadata });
    },
  };

  const result = await connectExternalWallet(
    { driverId: driver_id, address, nonce, signature },
    { repo, nowMs: Date.now() }
  );

  const status = result.status === "connected" ? 200 : 400;
  return new Response(JSON.stringify(result), { status });
});
