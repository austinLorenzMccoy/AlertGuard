// Deno wiring for `calculate-reward`. PRD reference: Backend PRD Section 10.2.
// Thin wiring only — business logic lives in ../_shared/rewards.ts.
// Excluded from the coverage target; see backend/README.md.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processRewardCalculation } from "../_shared/rewards.ts";
import { isInternalCall } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
// Reward-pool funding / token rate is an open question in the PRD (Section 14):
// "needs to be modeled against expected fleet-subscription revenue before
// mainnet payout goes live". TOKEN_RATE_PER_POINT is env-configured so it can
// be tuned per environment (testnet vs. mainnet) without a code change.
const TOKEN_RATE_PER_POINT = Number(Deno.env.get("TOKEN_RATE_PER_POINT") ?? "0.01");

serve(async (req: Request) => {
  // calculate-reward is only ever invoked internally (chained from
  // verify-session), per PRD Section 13: "internal function-to-function
  // calls ... are never publicly invokable directly."
  if (!isInternalCall(req.headers, INTERNAL_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { session_id } = await req.json();

  const { data: session, error } = await supabase
    .from("driving_sessions")
    .select("*")
    .eq("id", session_id)
    .single();

  if (error || !session) {
    return new Response(JSON.stringify({ error: "session_not_found" }), { status: 404 });
  }

  const result = await processRewardCalculation(session, {
    tokenRatePerPoint: TOKEN_RATE_PER_POINT,
    insertPendingReward: async ({ driverId, sessionId, points, tokenAmount }) => {
      const { data, error: insertError } = await supabase
        .from("rewards")
        .insert({
          driver_id: driverId,
          session_id: sessionId,
          points_earned: points,
          token_amount: tokenAmount,
          status: "pending",
        })
        .select()
        .single();
      if (insertError || !data) throw insertError ?? new Error("reward insert failed");
      return { id: data.id };
    },
    triggerPayout: async (rewardId: string) => {
      await fetch(`${SUPABASE_URL}/functions/v1/trigger-payout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "x-internal-secret": INTERNAL_SECRET ?? "",
        },
        body: JSON.stringify({ reward_id: rewardId }),
      });
    },
  });

  return new Response(JSON.stringify(result), { status: 200 });
});
