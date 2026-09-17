// Deno wiring for the reward-reconciliation cron job.
// PRD reference: Backend PRD Section 8 (Step 8) / Smart Contract PRD Section 6.
// Thin wiring only — business logic lives in ../_shared/reconciliation.ts.
// Excluded from the coverage target; see backend/README.md.
//
// Scheduling: registered as a real pg_cron job in
// supabase/migrations/20260101000005_pg_cron_jobs.sql, running every 5
// minutes and calling this function over HTTP via pg_net. See that migration
// and backend/README.md for how to verify/update the schedule.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { reconcilePendingRewards } from "../_shared/reconciliation.ts";
import { isInternalCall } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");
const STACKS_API_BASE_URL = Deno.env.get("STACKS_API_BASE_URL") ?? "https://api.testnet.hiro.so";

serve(async (req: Request) => {
  // Invoked by pg_cron (via pg_net -> HTTP, carrying the internal secret) or
  // manually for ops purposes with the service role.
  if (!isInternalCall(req.headers, INTERNAL_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: pendingRewards, error } = await supabase
    .from("rewards")
    .select("*")
    .eq("status", "pending");

  if (error) {
    return new Response(JSON.stringify({ error: "query_failed" }), { status: 500 });
  }

  const results = await reconcilePendingRewards(pendingRewards ?? [], {
    now: () => new Date(),
    stacksClient: {
      getTransactionStatus: async (txHash: string) => {
        const response = await fetch(`${STACKS_API_BASE_URL}/extended/v1/tx/${txHash}`);
        if (!response.ok) return "pending";
        const body = await response.json();
        if (body.tx_status === "success") return "success";
        if (typeof body.tx_status === "string" && body.tx_status.startsWith("abort")) return "failed";
        return "pending";
      },
    },
    retryPayout: async (rewardId: string) => {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/trigger-payout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "x-internal-secret": INTERNAL_SECRET ?? "",
        },
        body: JSON.stringify({ reward_id: rewardId }),
      });
      return await response.json();
    },
    updateRewardStatus: async (rewardId, update) => {
      if (update.status === "settled") {
        await supabase
          .from("rewards")
          .update({ status: "settled", stacks_tx_hash: update.stacksTxHash })
          .eq("id", rewardId);
      } else {
        await supabase.from("rewards").update({ status: "failed" }).eq("id", rewardId);
      }
    },
    flagForManualReview: async (rewardId: string, reason: string) => {
      console.error(`[reconcile-rewards] reward ${rewardId} flagged for manual review: ${reason}`);
      // v1.1: write to a dedicated ops/alerts table or page an on-call channel.
    },
  });

  return new Response(JSON.stringify({ results }), { status: 200 });
});
