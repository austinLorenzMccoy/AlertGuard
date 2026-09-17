// Deno wiring for `export-wallet-key`. PRD reference: Smart Contract PRD
// Section 3 ("Wallet Model"), Section 10 Phase B item 6.
// Thin wiring only — business logic lives in ../_shared/wallet.ts and
// ../_shared/wallet-crypto.ts. Excluded from the coverage target; see
// backend/README.md.
//
// Unlike generate-wallet/connect-external-wallet, this function does NOT
// accept internal calls — exporting a driver's raw private key should only
// ever happen in direct response to that driver's own authenticated
// request, never as a chained/internal side effect of something else.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { exportWalletKey, type WalletExportRepo } from "../_shared/wallet.ts";
import { parseMasterKey } from "../_shared/wallet-crypto.ts";
import { authorizeCaller, type JwtVerifier } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
const WALLET_MASTER_ENCRYPTION_KEY = Deno.env.get("WALLET_MASTER_ENCRYPTION_KEY") ?? "";

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

  // A driver may only export their own key, and only via their own JWT —
  // no internal-call bypass for this one (see file header comment).
  if (auth.isInternal || auth.userId !== driver_id) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const repo: WalletExportRepo = {
    findWalletKey: async (driverId) => {
      const { data } = await supabase
        .from("wallet_keys")
        .select("encrypted_private_key, encryption_key_id, wallet_type")
        .eq("driver_id", driverId)
        .maybeSingle();
      return data ?? null;
    },
    logEvent: async (driverId, eventType, metadata) => {
      await supabase.from("wallet_events").insert({ driver_id: driverId, event_type: eventType, metadata });
    },
  };

  const result = await exportWalletKey(driver_id, {
    repo,
    // v1: a single active master key/version, read from the Edge Function
    // secret. A future key rotation would look up the right key by
    // encryptionKeyId here instead of always returning the same one.
    resolveMasterKey: () => parseMasterKey(WALLET_MASTER_ENCRYPTION_KEY),
  });

  // The response is the ONE conceptual "shown once" payload — the mobile
  // client is responsible for displaying it in a dismiss-once modal and
  // never persisting/logging it locally. See WALLET_INTEGRATION.md.
  const status = result.status === "exported" ? 200 : 404;
  return new Response(JSON.stringify(result), { status });
});
