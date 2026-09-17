import { describe, it, expect, vi } from "vitest";
import {
  processRedemption,
  type RedeemRewardDeps,
  type RedemptionsRepo,
} from "../../supabase/functions/_shared/redemptions.ts";
import type { RedemptionRow } from "../../supabase/functions/_shared/types.ts";

function makeRepo(row: Partial<RedemptionRow> = {}): RedemptionsRepo {
  const insertProcessing = vi.fn().mockImplementation(
    async (input: { driverId: string; redemptionType: RedemptionRow["redemption_type"]; amount: number }) => ({
      id: "redemption-1",
      driver_id: input.driverId,
      redemption_type: input.redemptionType,
      amount: input.amount,
      status: "processing" as const,
      ...row,
    })
  );
  const updateStatus = vi.fn().mockResolvedValue(undefined);
  return { insertProcessing, updateStatus };
}

function makeDeps(overrides: Partial<RedeemRewardDeps> = {}): RedeemRewardDeps {
  return {
    repo: makeRepo(),
    vtuProvider: { topUpAirtime: vi.fn().mockResolvedValue({ reference: "vtu-ref" }) },
    stacksTransferProvider: { transfer: vi.fn().mockResolvedValue({ txid: "0xabc" }) },
    voucherProvider: { issueVoucher: vi.fn().mockResolvedValue({ voucherCode: "VOUCHER-1" }) },
    ...overrides,
  };
}

describe("processRedemption", () => {
  it("throws before writing anything when amount is zero", async () => {
    const deps = makeDeps();
    await expect(
      processRedemption(
        { driverId: "driver-1", redemptionType: "airtime", amount: 0, phone: "+234801" },
        deps
      )
    ).rejects.toThrow(RangeError);
    expect(deps.repo.insertProcessing).not.toHaveBeenCalled();
  });

  it("throws before writing anything when amount is negative", async () => {
    const deps = makeDeps();
    await expect(
      processRedemption(
        { driverId: "driver-1", redemptionType: "airtime", amount: -5, phone: "+234801" },
        deps
      )
    ).rejects.toThrow(RangeError);
  });

  describe("airtime", () => {
    it("completes when the VTU top-up succeeds", async () => {
      const deps = makeDeps();
      const result = await processRedemption(
        { driverId: "driver-1", redemptionType: "airtime", amount: 500, phone: "+2348010000000" },
        deps
      );

      expect(result.status).toBe("completed");
      expect(deps.vtuProvider.topUpAirtime).toHaveBeenCalledWith("+2348010000000", 500);
      expect(deps.repo.updateStatus).toHaveBeenCalledWith("redemption-1", "completed");
    });

    it("fails when no phone number is provided", async () => {
      const deps = makeDeps();
      const result = await processRedemption(
        { driverId: "driver-1", redemptionType: "airtime", amount: 500 },
        deps
      );

      expect(result.status).toBe("failed");
      expect(deps.vtuProvider.topUpAirtime).not.toHaveBeenCalled();
      expect(deps.repo.updateStatus).toHaveBeenCalledWith("redemption-1", "failed");
    });

    it("fails when the VTU provider throws", async () => {
      const deps = makeDeps({
        vtuProvider: { topUpAirtime: vi.fn().mockRejectedValue(new Error("vtu down")) },
      });
      const result = await processRedemption(
        { driverId: "driver-1", redemptionType: "airtime", amount: 500, phone: "+2348010000000" },
        deps
      );

      expect(result.status).toBe("failed");
    });
  });

  describe("token_withdrawal", () => {
    it("completes when the Stacks transfer succeeds", async () => {
      const deps = makeDeps();
      const result = await processRedemption(
        {
          driverId: "driver-1",
          redemptionType: "token_withdrawal",
          amount: 10,
          driverWalletAddress: "ST1DRIVER",
          rewardPoolWalletAddress: "ST1POOL",
        },
        deps
      );

      expect(result.status).toBe("completed");
      expect(deps.stacksTransferProvider.transfer).toHaveBeenCalledWith({
        fromWalletAddress: "ST1DRIVER",
        toWalletAddress: "ST1POOL",
        amount: 10,
      });
    });

    it("fails when the driver has no wallet address", async () => {
      const deps = makeDeps();
      const result = await processRedemption(
        {
          driverId: "driver-1",
          redemptionType: "token_withdrawal",
          amount: 10,
          rewardPoolWalletAddress: "ST1POOL",
        },
        deps
      );

      expect(result.status).toBe("failed");
      expect(deps.stacksTransferProvider.transfer).not.toHaveBeenCalled();
    });

    it("fails when the reward pool wallet address is not configured", async () => {
      const deps = makeDeps();
      const result = await processRedemption(
        {
          driverId: "driver-1",
          redemptionType: "token_withdrawal",
          amount: 10,
          driverWalletAddress: "ST1DRIVER",
        },
        deps
      );

      expect(result.status).toBe("failed");
    });

    it("fails when the Stacks transfer throws", async () => {
      const deps = makeDeps({
        stacksTransferProvider: { transfer: vi.fn().mockRejectedValue(new Error("chain error")) },
      });
      const result = await processRedemption(
        {
          driverId: "driver-1",
          redemptionType: "token_withdrawal",
          amount: 10,
          driverWalletAddress: "ST1DRIVER",
          rewardPoolWalletAddress: "ST1POOL",
        },
        deps
      );

      expect(result.status).toBe("failed");
    });
  });

  describe("fuel_voucher", () => {
    it("completes by issuing an internal voucher", async () => {
      const deps = makeDeps();
      const result = await processRedemption(
        { driverId: "driver-1", redemptionType: "fuel_voucher", amount: 2000 },
        deps
      );

      expect(result.status).toBe("completed");
      expect(deps.voucherProvider.issueVoucher).toHaveBeenCalledWith({
        driverId: "driver-1",
        redemptionType: "fuel_voucher",
        amount: 2000,
      });
    });

    it("fails when the voucher provider throws", async () => {
      const deps = makeDeps({
        voucherProvider: { issueVoucher: vi.fn().mockRejectedValue(new Error("voucher error")) },
      });
      const result = await processRedemption(
        { driverId: "driver-1", redemptionType: "fuel_voucher", amount: 2000 },
        deps
      );
      expect(result.status).toBe("failed");
    });
  });

  describe("insurance_discount", () => {
    it("completes by issuing an internal voucher", async () => {
      const deps = makeDeps();
      const result = await processRedemption(
        { driverId: "driver-1", redemptionType: "insurance_discount", amount: 15 },
        deps
      );

      expect(result.status).toBe("completed");
      expect(deps.voucherProvider.issueVoucher).toHaveBeenCalledWith({
        driverId: "driver-1",
        redemptionType: "insurance_discount",
        amount: 15,
      });
    });
  });

  it("throws for an unsupported redemption_type (exhaustiveness guard)", async () => {
    const deps = makeDeps();
    await expect(
      processRedemption(
        {
          driverId: "driver-1",
          redemptionType: "not_a_real_type" as unknown as "airtime",
          amount: 10,
        },
        deps
      )
    ).rejects.toThrow(/unsupported redemption_type/);
  });
});
