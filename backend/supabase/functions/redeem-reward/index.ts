// Deno wiring for `redeem-reward`. PRD reference: Backend PRD Section 10.5.
// Thin wiring only — business logic lives in ../_shared/redemptions.ts.
// Excluded from the coverage target; see backend/README.md.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processRedemption, type RedemptionsRepo } from "../_shared/redemptions.ts";
import { authorizeCaller, type JwtVerifier } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
const VTPASS_API_KEY = Deno.env.get("VTPASS_API_KEY") ?? "";
const REWARD_POOL_WALLET_ADDRESS = Deno.env.get("REWARD_POOL_WALLET_ADDRESS") ?? "";

serve(async (req: Request) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // redeem-reward is called directly by the mobile app (driver redeeming
  // their own balance), so it validates the caller's JWT — not just the
  // internal shared secret.
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

  const { driver_id, redemption_type, amount, phone } = await req.json();

  // A driver may only redeem their own reward balance — reject if the caller
  // (from their verified JWT) doesn't match the driver_id in the request,
  // unless this is a trusted internal call.
  if (!auth.isInternal && auth.userId !== driver_id) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_address")
    .eq("id", driver_id)
    .single();

  const repo: RedemptionsRepo = {
    insertProcessing: async ({ driverId, redemptionType, amount: amt }) => {
      const { data, error } = await supabase
        .from("redemptions")
        .insert({ driver_id: driverId, redemption_type: redemptionType, amount: amt, status: "processing" })
        .select()
        .single();
      if (error || !data) throw error ?? new Error("redemption insert failed");
      return data;
    },
    updateStatus: async (redemptionId, status) => {
      await supabase.from("redemptions").update({ status }).eq("id", redemptionId);
    },
  };

  const result = await processRedemption(
    {
      driverId: driver_id,
      redemptionType: redemption_type,
      amount,
      phone,
      driverWalletAddress: profile?.wallet_address ?? null,
      rewardPoolWalletAddress: REWARD_POOL_WALLET_ADDRESS,
    },
    {
      repo,
      vtuProvider: {
        topUpAirtime: async (toPhone: string, amt: number) => {
          const response = await fetch("https://vtpass.com/api/pay", {
            method: "POST",
            headers: { "Content-Type": "application/json", "api-key": VTPASS_API_KEY },
            body: JSON.stringify({ phone: toPhone, amount: amt, serviceID: "airtime" }),
          });
          if (!response.ok) throw new Error("vtu_api_error");
          const body = await response.json();
          return { reference: body.requestId ?? body.reference };
        },
      },
      stacksTransferProvider: {
        transfer: async () => {
          // v1.1: sponsored-transaction / pre-funded-float decision is still
          // open per Smart Contract PRD Section 8/12 — stubbed until that
          // ships; production wiring point is here.
          throw new Error("token_withdrawal not yet implemented pending Smart Contract PRD Section 8 decision");
        },
      },
      voucherProvider: {
        issueVoucher: async () => ({ voucherCode: crypto.randomUUID() }),
      },
    }
  );

  return new Response(JSON.stringify(result), { status: 200 });
});
