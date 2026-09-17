// Deno wiring for `trigger-payout`. PRD reference: Backend PRD Section 10.3.
// Thin wiring only — business logic lives in ../_shared/payout.ts.
// Excluded from the coverage target; see backend/README.md.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  makeContractCall,
  broadcastTransaction,
} from "https://esm.sh/@stacks/transactions@6";
import { triggerPayout, createStacksPayoutClient } from "../_shared/payout.ts";
import { isInternalCall } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_FUNCTION_SECRET");

const STACKS_REWARD_CONTRACT_ADDRESS = Deno.env.get("STACKS_REWARD_CONTRACT_ADDRESS")!;
const STACKS_CONTRACT_NAME = Deno.env.get("STACKS_CONTRACT_NAME") ?? "alertguard-rewards";
const STACKS_FUNCTION_NAME = Deno.env.get("STACKS_MINT_FUNCTION_NAME") ?? "mint-reward";
const STACKS_NETWORK = Deno.env.get("STACKS_NETWORK") ?? "testnet";
const REWARD_POOL_PRIVATE_KEY = Deno.env.get("REWARD_POOL_PRIVATE_KEY")!;

serve(async (req: Request) => {
  // trigger-payout is only ever invoked internally (chained from
  // calculate-reward, or retried by the reconciliation cron).
  if (!isInternalCall(req.headers, INTERNAL_SECRET)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { reward_id } = await req.json();

  const { data: reward, error } = await supabase
    .from("rewards")
    .select("*, profiles(wallet_address)")
    .eq("id", reward_id)
    .single();

  if (error || !reward) {
    return new Response(JSON.stringify({ error: "reward_not_found" }), { status: 404 });
  }

  // Real @stacks/transactions call, wired for production use, but assembled
  // through the injectable client so the settlement *logic* stays testable
  // without a real network/private key.
  const stacksClient = createStacksPayoutClient({ makeContractCall, broadcastTransaction });

  const outcome = await triggerPayout(
    {
      id: reward.id,
      token_amount: reward.token_amount,
      driver_id: reward.driver_id,
      walletAddress: reward.profiles?.wallet_address ?? null,
    },
    {
      stacksClient,
      config: {
        contractAddress: STACKS_REWARD_CONTRACT_ADDRESS,
        contractName: STACKS_CONTRACT_NAME,
        functionName: STACKS_FUNCTION_NAME,
        senderKey: REWARD_POOL_PRIVATE_KEY,
        network: STACKS_NETWORK,
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
    }
  );

  return new Response(JSON.stringify(outcome), { status: 200 });
});
