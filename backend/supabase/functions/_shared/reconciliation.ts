// Pure reconciliation logic for the reward-reconciliation cron job.
// PRD reference: Backend PRD Section 8 (Step 8) / Smart Contract PRD Section 6.
//
// "Reconcile: off-chain `rewards` table status must always match on-chain tx
// state — add a scheduled Edge Function (cron) that re-checks any `pending`
// reward older than 5 minutes ... queries the transaction status via the
// Stacks API, and either confirms settlement or retries/flags for manual
// review. On-chain and off-chain state must never silently diverge."

import type { RewardRow } from "./types.ts";

export type StacksTxStatus = "success" | "pending" | "failed";

export interface StacksStatusClient {
  getTransactionStatus(txHash: string): Promise<StacksTxStatus>;
}

export interface RetryPayoutResult {
  status: "settled" | "failed";
  txHash?: string;
}

export interface ReconciliationDeps {
  now: () => Date;
  stacksClient: StacksStatusClient;
  /** Re-invokes trigger-payout for a reward that never got a tx hash recorded. */
  retryPayout: (rewardId: string) => Promise<RetryPayoutResult>;
  updateRewardStatus: (
    rewardId: string,
    update: { status: "settled"; stacksTxHash: string } | { status: "failed" }
  ) => Promise<void>;
  /** Records a reward that needs a human to look at it (e.g. an ops alert/log row). */
  flagForManualReview: (rewardId: string, reason: string) => Promise<void>;
}

export interface ReconciliationOptions {
  thresholdMinutes?: number;
}

export type ReconciliationAction =
  | "skipped_not_pending"
  | "skipped_not_stale"
  | "confirmed_settled"
  | "confirmed_failed"
  | "still_pending"
  | "retried_settled"
  | "flagged_retry_failed"
  | "flagged_retry_error";

export interface ReconciliationEntry {
  rewardId: string;
  action: ReconciliationAction;
}

const DEFAULT_THRESHOLD_MINUTES = 5;

function ageMinutes(createdAt: string, now: Date): number {
  return (now.getTime() - new Date(createdAt).getTime()) / 60_000;
}

/**
 * Reconciles a single reward row. Exported separately from the batch runner
 * below so each branch is directly unit-testable.
 */
export async function reconcileReward(
  reward: RewardRow,
  deps: ReconciliationDeps,
  options: ReconciliationOptions = {}
): Promise<ReconciliationEntry> {
  const thresholdMinutes = options.thresholdMinutes ?? DEFAULT_THRESHOLD_MINUTES;

  if (reward.status !== "pending") {
    return { rewardId: reward.id, action: "skipped_not_pending" };
  }

  if (ageMinutes(reward.created_at, deps.now()) < thresholdMinutes) {
    return { rewardId: reward.id, action: "skipped_not_stale" };
  }

  if (reward.stacks_tx_hash) {
    const txStatus = await deps.stacksClient.getTransactionStatus(reward.stacks_tx_hash);
    if (txStatus === "success") {
      await deps.updateRewardStatus(reward.id, {
        status: "settled",
        stacksTxHash: reward.stacks_tx_hash,
      });
      return { rewardId: reward.id, action: "confirmed_settled" };
    }
    if (txStatus === "failed") {
      await deps.updateRewardStatus(reward.id, { status: "failed" });
      return { rewardId: reward.id, action: "confirmed_failed" };
    }
    return { rewardId: reward.id, action: "still_pending" };
  }

  // No tx hash was ever recorded: trigger-payout likely never completed
  // (e.g. the chained fetch from calculate-reward failed). Retry once; if
  // that also fails to settle, flag for manual review rather than silently
  // leaving it pending forever or guessing at a status.
  try {
    const retryResult = await deps.retryPayout(reward.id);
    if (retryResult.status === "settled") {
      return { rewardId: reward.id, action: "retried_settled" };
    }
    await deps.flagForManualReview(reward.id, "retry_failed");
    return { rewardId: reward.id, action: "flagged_retry_failed" };
  } catch (err) {
    await deps.flagForManualReview(
      reward.id,
      err instanceof Error ? err.message : "unknown_retry_error"
    );
    return { rewardId: reward.id, action: "flagged_retry_error" };
  }
}

/** Runs reconciliation over a batch of rewards (typically all `pending` rows). */
export async function reconcilePendingRewards(
  rewards: RewardRow[],
  deps: ReconciliationDeps,
  options: ReconciliationOptions = {}
): Promise<ReconciliationEntry[]> {
  const results: ReconciliationEntry[] = [];
  for (const reward of rewards) {
    results.push(await reconcileReward(reward, deps, options));
  }
  return results;
}
