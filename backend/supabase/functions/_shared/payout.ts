// Pure settlement-orchestration logic for `trigger-payout`.
// PRD reference: Backend PRD Section 10.3; Smart Contract PRD Section 6-7.
//
// The real @stacks/transactions call (makeContractCall + broadcastTransaction)
// is network I/O and Deno-specific import territory, so it lives behind the
// StacksPayoutClient interface. `createStacksPayoutClient` in this file is the
// production implementation, built via dependency injection of the actual
// @stacks/transactions functions (passed in, never imported directly here) —
// that keeps this file importable and testable under plain Node/Vitest with
// zero network dependency, while the real client used in production is still
// "wired for real" per the task requirement, just assembled from the Deno
// entrypoint (index.ts) which has access to `https://esm.sh/@stacks/transactions`.

import type { RewardRow } from "./types.ts";

export interface StacksPayoutRequest {
  rewardId: string;
  amount: number;
  recipient: string;
  contractAddress: string;
  contractName: string;
  functionName: string;
  senderKey: string;
  network: string;
}

export interface StacksPayoutClient {
  settleReward(request: StacksPayoutRequest): Promise<{ txid: string }>;
}

export interface PayoutConfig {
  contractAddress: string;
  contractName: string;
  functionName: string;
  senderKey: string;
  network: string;
}

export interface RewardWithWallet
  extends Pick<RewardRow, "id" | "token_amount" | "driver_id"> {
  walletAddress: string | null;
}

export type PayoutOutcome =
  | { status: "settled"; txHash: string }
  | { status: "failed"; error: string };

export interface PayoutDeps {
  stacksClient: StacksPayoutClient;
  config: PayoutConfig;
  updateRewardStatus: (
    rewardId: string,
    update: { status: "settled"; stacksTxHash: string } | { status: "failed" }
  ) => Promise<void>;
}

/**
 * Settles a single reward on-chain and reconciles the off-chain ledger row.
 * - success path: calls stacksClient.settleReward, then updates the reward
 *   row to `settled` with the returned tx hash.
 * - failure path (missing wallet, or the Stacks call throwing): updates the
 *   reward row to `failed` and never throws — trigger-payout's index.ts
 *   sketch in the PRD always returns 200 "ok" regardless of outcome, so
 *   failures are terminal here, not propagated as exceptions.
 */
export async function triggerPayout(
  reward: RewardWithWallet,
  deps: PayoutDeps
): Promise<PayoutOutcome> {
  if (!reward.walletAddress) {
    await deps.updateRewardStatus(reward.id, { status: "failed" });
    return { status: "failed", error: "missing_wallet_address" };
  }

  const amount = reward.token_amount ?? 0;
  if (amount <= 0) {
    await deps.updateRewardStatus(reward.id, { status: "failed" });
    return { status: "failed", error: "non_positive_token_amount" };
  }

  try {
    const result = await deps.stacksClient.settleReward({
      rewardId: reward.id,
      amount,
      recipient: reward.walletAddress,
      contractAddress: deps.config.contractAddress,
      contractName: deps.config.contractName,
      functionName: deps.config.functionName,
      senderKey: deps.config.senderKey,
      network: deps.config.network,
    });

    await deps.updateRewardStatus(reward.id, {
      status: "settled",
      stacksTxHash: result.txid,
    });
    return { status: "settled", txHash: result.txid };
  } catch (err) {
    await deps.updateRewardStatus(reward.id, { status: "failed" });
    return {
      status: "failed",
      error: err instanceof Error ? err.message : "unknown_stacks_error",
    };
  }
}

/**
 * Production StacksPayoutClient, assembled from injected @stacks/transactions
 * functions (the Deno-only `index.ts` wiring imports the real
 * `makeContractCall` / `broadcastTransaction` from esm.sh and passes them in
 * here). Kept in this file — rather than index.ts — so the *shape* of the
 * production client construction is itself covered by unit tests using fake
 * makeContractCall/broadcastTransaction implementations; only the actual
 * `import` statement lives in the Deno-only wiring layer.
 */
export interface StacksTransactionsSdk {
  makeContractCall: (options: Record<string, unknown>) => Promise<unknown>;
  broadcastTransaction: (
    tx: unknown,
    network: unknown
  ) => Promise<{ txid: string; error?: string }>;
}

export function createStacksPayoutClient(sdk: StacksTransactionsSdk): StacksPayoutClient {
  return {
    async settleReward(request: StacksPayoutRequest): Promise<{ txid: string }> {
      const tx = await sdk.makeContractCall({
        contractAddress: request.contractAddress,
        contractName: request.contractName,
        functionName: request.functionName,
        functionArgs: [request.rewardId, request.amount, request.recipient],
        senderKey: request.senderKey,
        network: request.network,
      });

      const result = await sdk.broadcastTransaction(tx, request.network);
      if (result.error) {
        throw new Error(`stacks broadcast failed: ${result.error}`);
      }
      return { txid: result.txid };
    },
  };
}
