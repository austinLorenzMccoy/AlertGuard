// Deno wiring for `generate-wallet`. PRD reference: Smart Contract PRD
// Section 3 ("Wallet Model"), Section 10 Phase B item 5.
// Thin wiring only — business logic lives in ../_shared/wallet.ts and
// ../_shared/wallet-crypto.ts. Excluded from the coverage target; see
// backend/README.md.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateAndStoreWallet, type WalletGenerationRepo } from "../_shared/wallet.ts";
import { parseMasterKey } from "../_shared/wallet-crypto.ts";
import { authorizeCaller, type JwtVerifier } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
const WALLET_MASTER_ENCRYPTION_KEY = Deno.env.get("WALLET_MASTER_ENCRYPTION_KEY") ?? "";
const WALLET_ENCRYPTION_KEY_ID = Deno.env.get("WALLET_ENCRYPTION_KEY_ID") ?? "v1";
const STACKS_NETWORK = (Deno.env.get("STACKS_NETWORK") ?? "testnet") as "mainnet" | "testnet";

serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Callable either by the driver's own JWT (client explicitly requests
  // wallet generation post-signup) or internally (e.g. chained from the
  // signup flow) — same dual-mode pattern as redeem-reward.
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

  // A driver may only generate their own wallet.
  if (!auth.isInternal && auth.userId !== driver_id) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const repo: WalletGenerationRepo = {
    findWalletKey: async (driverId) => {
      const { data } = await supabase
        .from("wallet_keys")
        .select("id")
        .eq("driver_id", driverId)
        .maybeSingle();
      return data ?? null;
    },
    insertWalletKey: async ({ driverId, encryptedPrivateKey, encryptionKeyId, walletType }) => {
      const { error } = await supabase.from("wallet_keys").insert({
        driver_id: driverId,
        encrypted_private_key: encryptedPrivateKey,
        encryption_key_id: encryptionKeyId,
        wallet_type: walletType,
      });
      if (error) throw error;
    },
    updateWalletAddress: async (driverId, address) => {
      await supabase.from("profiles").update({ wallet_address: address }).eq("id", driverId);
    },
    logEvent: async (driverId, eventType, metadata) => {
      await supabase.from("wallet_events").insert({ driver_id: driverId, event_type: eventType, metadata });
    },
  };

  try {
    const result = await generateAndStoreWallet(driver_id, {
      repo,
      masterKey: parseMasterKey(WALLET_MASTER_ENCRYPTION_KEY),
      encryptionKeyId: WALLET_ENCRYPTION_KEY_ID,
      network: STACKS_NETWORK,
    });
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (err) {
    // Most commonly: "driver already has a wallet on file" (double-generation
    // guard in _shared/wallet.ts) — a 409, not a 500, since it's an expected
    // conflict, not a server fault.
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "wallet_generation_failed" }),
      { status: 409 }
    );
  }
});
