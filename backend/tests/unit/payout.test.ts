import { describe, it, expect, vi } from "vitest";
import {
  triggerPayout,
  createStacksPayoutClient,
  type PayoutDeps,
  type RewardWithWallet,
  type StacksTransactionsSdk,
} from "../../supabase/functions/_shared/payout.ts";

function makeReward(overrides: Partial<RewardWithWallet> = {}): RewardWithWallet {
  return {
    id: "reward-1",
    driver_id: "driver-1",
    token_amount: 4.5,
    walletAddress: "ST1DRIVERWALLETXXXXXXXXXXXXXXXXXXXXXXXXX",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<PayoutDeps> = {}): PayoutDeps {
  return {
    stacksClient: { settleReward: vi.fn().mockResolvedValue({ txid: "0xabc123" }) },
    config: {
      contractAddress: "ST000...CONTRACT",
      contractName: "alertguard-rewards",
      functionName: "mint-reward",
      senderKey: "test-sender-key",
      network: "testnet",
    },
    updateRewardStatus: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("triggerPayout", () => {
  it("settles successfully and updates the ledger with the tx hash", async () => {
    const deps = makeDeps();
    const outcome = await triggerPayout(makeReward(), deps);

    expect(outcome).toEqual({ status: "settled", txHash: "0xabc123" });
    expect(deps.updateRewardStatus).toHaveBeenCalledWith("reward-1", {
      status: "settled",
      stacksTxHash: "0xabc123",
    });
    expect(deps.stacksClient.settleReward).toHaveBeenCalledWith({
      rewardId: "reward-1",
      amount: 4.5,
      recipient: "ST1DRIVERWALLETXXXXXXXXXXXXXXXXXXXXXXXXX",
      contractAddress: "ST000...CONTRACT",
      contractName: "alertguard-rewards",
      functionName: "mint-reward",
      senderKey: "test-sender-key",
      network: "testnet",
    });
  });

  it("marks the reward failed when the wallet address is missing", async () => {
    const deps = makeDeps();
    const outcome = await triggerPayout(makeReward({ walletAddress: null }), deps);

    expect(outcome).toEqual({ status: "failed", error: "missing_wallet_address" });
    expect(deps.updateRewardStatus).toHaveBeenCalledWith("reward-1", { status: "failed" });
    expect(deps.stacksClient.settleReward).not.toHaveBeenCalled();
  });

  it("marks the reward failed when token_amount is zero", async () => {
    const deps = makeDeps();
    const outcome = await triggerPayout(makeReward({ token_amount: 0 }), deps);

    expect(outcome).toEqual({ status: "failed", error: "non_positive_token_amount" });
    expect(deps.stacksClient.settleReward).not.toHaveBeenCalled();
  });

  it("marks the reward failed when token_amount is negative", async () => {
    const deps = makeDeps();
    const outcome = await triggerPayout(makeReward({ token_amount: -1 }), deps);
    expect(outcome.status).toBe("failed");
  });

  it("marks the reward failed when token_amount is null", async () => {
    const deps = makeDeps();
    const outcome = await triggerPayout(makeReward({ token_amount: null }), deps);
    expect(outcome).toEqual({ status: "failed", error: "non_positive_token_amount" });
  });

  it("marks the reward failed when the Stacks client throws an Error", async () => {
    const deps = makeDeps({
      stacksClient: { settleReward: vi.fn().mockRejectedValue(new Error("broadcast rejected")) },
    });
    const outcome = await triggerPayout(makeReward(), deps);

    expect(outcome).toEqual({ status: "failed", error: "broadcast rejected" });
    expect(deps.updateRewardStatus).toHaveBeenCalledWith("reward-1", { status: "failed" });
  });

  it("marks the reward failed when the Stacks client throws a non-Error value", async () => {
    const deps = makeDeps({
      stacksClient: { settleReward: vi.fn().mockRejectedValue("network down") },
    });
    const outcome = await triggerPayout(makeReward(), deps);

    expect(outcome).toEqual({ status: "failed", error: "unknown_stacks_error" });
  });
});

describe("createStacksPayoutClient", () => {
  function makeSdk(overrides: Partial<StacksTransactionsSdk> = {}): StacksTransactionsSdk {
    return {
      makeContractCall: vi.fn().mockResolvedValue({ signed: true }),
      broadcastTransaction: vi.fn().mockResolvedValue({ txid: "0xdeadbeef" }),
      ...overrides,
    };
  }

  it("builds and broadcasts a contract call, returning the txid", async () => {
    const sdk = makeSdk();
    const client = createStacksPayoutClient(sdk);

    const result = await client.settleReward({
      rewardId: "reward-1",
      amount: 10,
      recipient: "ST1RECIPIENT",
      contractAddress: "ST000",
      contractName: "alertguard-rewards",
      functionName: "mint-reward",
      senderKey: "key",
      network: "testnet",
    });

    expect(result).toEqual({ txid: "0xdeadbeef" });
    expect(sdk.makeContractCall).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: "ST000",
        contractName: "alertguard-rewards",
        functionName: "mint-reward",
        functionArgs: ["reward-1", 10, "ST1RECIPIENT"],
        senderKey: "key",
        network: "testnet",
      })
    );
  });

  it("throws when the broadcast result carries an error", async () => {
    const sdk = makeSdk({
      broadcastTransaction: vi.fn().mockResolvedValue({ txid: "", error: "NotEnoughFunds" }),
    });
    const client = createStacksPayoutClient(sdk);

    await expect(
      client.settleReward({
        rewardId: "reward-1",
        amount: 10,
        recipient: "ST1RECIPIENT",
        contractAddress: "ST000",
        contractName: "alertguard-rewards",
        functionName: "mint-reward",
        senderKey: "key",
        network: "testnet",
      })
    ).rejects.toThrow(/NotEnoughFunds/);
  });
});
