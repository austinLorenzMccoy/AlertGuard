import { describe, it, expect, vi } from "vitest";
import {
  reconcileReward,
  reconcilePendingRewards,
  type ReconciliationDeps,
} from "../../supabase/functions/_shared/reconciliation.ts";
import type { RewardRow } from "../../supabase/functions/_shared/types.ts";

const NOW = new Date("2026-01-01T12:00:00.000Z");

function makeReward(overrides: Partial<RewardRow> = {}): RewardRow {
  return {
    id: "reward-1",
    driver_id: "driver-1",
    session_id: "session-1",
    points_earned: 100,
    token_amount: 1,
    status: "pending",
    stacks_tx_hash: null,
    created_at: "2026-01-01T11:50:00.000Z", // 10 minutes old by default
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ReconciliationDeps> = {}): ReconciliationDeps {
  return {
    now: () => NOW,
    stacksClient: { getTransactionStatus: vi.fn().mockResolvedValue("pending") },
    retryPayout: vi.fn().mockResolvedValue({ status: "failed" }),
    updateRewardStatus: vi.fn().mockResolvedValue(undefined),
    flagForManualReview: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("reconcileReward", () => {
  it("skips a reward that is not pending", async () => {
    const deps = makeDeps();
    const entry = await reconcileReward(makeReward({ status: "settled" }), deps);
    expect(entry).toEqual({ rewardId: "reward-1", action: "skipped_not_pending" });
    expect(deps.updateRewardStatus).not.toHaveBeenCalled();
  });

  it("skips a pending reward that isn't stale yet", async () => {
    const deps = makeDeps();
    const entry = await reconcileReward(
      makeReward({ created_at: "2026-01-01T11:58:00.000Z" }), // 2 minutes old
      deps
    );
    expect(entry).toEqual({ rewardId: "reward-1", action: "skipped_not_stale" });
  });

  it("treats a reward exactly at the staleness threshold as stale", async () => {
    const deps = makeDeps({ stacksClient: { getTransactionStatus: vi.fn().mockResolvedValue("success") } });
    const entry = await reconcileReward(
      makeReward({ created_at: "2026-01-01T11:55:00.000Z", stacks_tx_hash: "0xabc" }), // exactly 5 min
      deps
    );
    expect(entry.action).toBe("confirmed_settled");
  });

  it("confirms settlement when the on-chain tx succeeded", async () => {
    const deps = makeDeps({
      stacksClient: { getTransactionStatus: vi.fn().mockResolvedValue("success") },
    });
    const entry = await reconcileReward(makeReward({ stacks_tx_hash: "0xabc" }), deps);

    expect(entry).toEqual({ rewardId: "reward-1", action: "confirmed_settled" });
    expect(deps.updateRewardStatus).toHaveBeenCalledWith("reward-1", {
      status: "settled",
      stacksTxHash: "0xabc",
    });
  });

  it("marks failed when the on-chain tx failed", async () => {
    const deps = makeDeps({
      stacksClient: { getTransactionStatus: vi.fn().mockResolvedValue("failed") },
    });
    const entry = await reconcileReward(makeReward({ stacks_tx_hash: "0xabc" }), deps);

    expect(entry).toEqual({ rewardId: "reward-1", action: "confirmed_failed" });
    expect(deps.updateRewardStatus).toHaveBeenCalledWith("reward-1", { status: "failed" });
  });

  it("leaves it as still_pending when the on-chain tx is itself still pending", async () => {
    const deps = makeDeps({
      stacksClient: { getTransactionStatus: vi.fn().mockResolvedValue("pending") },
    });
    const entry = await reconcileReward(makeReward({ stacks_tx_hash: "0xabc" }), deps);

    expect(entry).toEqual({ rewardId: "reward-1", action: "still_pending" });
    expect(deps.updateRewardStatus).not.toHaveBeenCalled();
  });

  it("retries payout and reports retried_settled when no tx hash was ever recorded and retry succeeds", async () => {
    const deps = makeDeps({
      retryPayout: vi.fn().mockResolvedValue({ status: "settled", txHash: "0xnew" }),
    });
    const entry = await reconcileReward(makeReward({ stacks_tx_hash: null }), deps);

    expect(entry).toEqual({ rewardId: "reward-1", action: "retried_settled" });
    expect(deps.retryPayout).toHaveBeenCalledWith("reward-1");
    expect(deps.flagForManualReview).not.toHaveBeenCalled();
  });

  it("flags for manual review when the retry resolves to failed", async () => {
    const deps = makeDeps({ retryPayout: vi.fn().mockResolvedValue({ status: "failed" }) });
    const entry = await reconcileReward(makeReward({ stacks_tx_hash: null }), deps);

    expect(entry).toEqual({ rewardId: "reward-1", action: "flagged_retry_failed" });
    expect(deps.flagForManualReview).toHaveBeenCalledWith("reward-1", "retry_failed");
  });

  it("flags for manual review when the retry throws an Error", async () => {
    const deps = makeDeps({ retryPayout: vi.fn().mockRejectedValue(new Error("timeout")) });
    const entry = await reconcileReward(makeReward({ stacks_tx_hash: null }), deps);

    expect(entry).toEqual({ rewardId: "reward-1", action: "flagged_retry_error" });
    expect(deps.flagForManualReview).toHaveBeenCalledWith("reward-1", "timeout");
  });

  it("flags for manual review when the retry throws a non-Error value", async () => {
    const deps = makeDeps({ retryPayout: vi.fn().mockRejectedValue("boom") });
    const entry = await reconcileReward(makeReward({ stacks_tx_hash: null }), deps);

    expect(entry).toEqual({ rewardId: "reward-1", action: "flagged_retry_error" });
    expect(deps.flagForManualReview).toHaveBeenCalledWith("reward-1", "unknown_retry_error");
  });

  it("respects a custom thresholdMinutes option", async () => {
    const deps = makeDeps();
    const entry = await reconcileReward(
      makeReward({ created_at: "2026-01-01T11:59:30.000Z" }), // 30s old
      deps,
      { thresholdMinutes: 0.25 } // 15s
    );
    expect(entry.action).not.toBe("skipped_not_stale");
  });
});

describe("reconcilePendingRewards", () => {
  it("processes a batch of rewards independently", async () => {
    const deps = makeDeps({
      stacksClient: { getTransactionStatus: vi.fn().mockResolvedValue("success") },
    });
    const rewards = [
      makeReward({ id: "r1", stacks_tx_hash: "0x1" }),
      makeReward({ id: "r2", status: "settled" }),
      makeReward({ id: "r3", created_at: "2026-01-01T11:59:00.000Z" }),
    ];

    const results = await reconcilePendingRewards(rewards, deps);

    expect(results).toEqual([
      { rewardId: "r1", action: "confirmed_settled" },
      { rewardId: "r2", action: "skipped_not_pending" },
      { rewardId: "r3", action: "skipped_not_stale" },
    ]);
  });

  it("returns an empty array for an empty batch", async () => {
    const deps = makeDeps();
    const results = await reconcilePendingRewards([], deps);
    expect(results).toEqual([]);
  });
});
