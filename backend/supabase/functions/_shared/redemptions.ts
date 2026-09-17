// Pure redemption logic for `redeem-reward`.
// PRD reference: Backend PRD Section 10.5, Section 12 Step 9.
//
// Step 9 of the PRD's plan explicitly sequences this: "integrate one
// redemption channel first (airtime via VTU API) before adding fuel
// vouchers/insurance discounts." That is reflected below: `airtime` and
// `token_withdrawal` call real injectable external providers (VTU API,
// Stacks transfer) with success/failure branches; `fuel_voucher` and
// `insurance_discount` are v1 stubs that complete immediately as an
// internally-issued voucher (no external vendor integrated yet) — this is a
// deliberate, documented simplification, not a missing branch.

import type { RedemptionRow, RedemptionType } from "./types.ts";

export interface VtuProvider {
  topUpAirtime(phone: string, amount: number): Promise<{ reference: string }>;
}

export interface StacksTransferProvider {
  transfer(input: {
    fromWalletAddress: string;
    toWalletAddress: string;
    amount: number;
  }): Promise<{ txid: string }>;
}

export interface VoucherProvider {
  issueVoucher(input: {
    driverId: string;
    redemptionType: "fuel_voucher" | "insurance_discount";
    amount: number;
  }): Promise<{ voucherCode: string }>;
}

export interface RedeemRewardInput {
  driverId: string;
  redemptionType: RedemptionType;
  amount: number;
  /** Required for `airtime`. */
  phone?: string | null;
  /** Required for `token_withdrawal`. */
  driverWalletAddress?: string | null;
  /** Required for `token_withdrawal`. */
  rewardPoolWalletAddress?: string | null;
}

export interface RedemptionsRepo {
  insertProcessing(input: {
    driverId: string;
    redemptionType: RedemptionType;
    amount: number;
  }): Promise<RedemptionRow>;
  updateStatus(
    redemptionId: string,
    status: "completed" | "failed"
  ): Promise<void>;
}

export interface RedeemRewardDeps {
  repo: RedemptionsRepo;
  vtuProvider: VtuProvider;
  stacksTransferProvider: StacksTransferProvider;
  voucherProvider: VoucherProvider;
}

export type RedeemRewardResult = RedemptionRow & { status: "completed" | "failed" };

/**
 * Processes one redemption request end to end: insert as `processing` (per
 * the PRD sketch), dispatch to the right channel for `redemption_type`, then
 * resolve to `completed` or `failed`.
 */
export async function processRedemption(
  input: RedeemRewardInput,
  deps: RedeemRewardDeps
): Promise<RedeemRewardResult> {
  if (!(input.amount > 0)) {
    // Negative/zero amount is rejected before any row is written or any
    // provider is called — there is nothing to redeem.
    throw new RangeError("redemption amount must be greater than zero");
  }

  const redemption = await deps.repo.insertProcessing({
    driverId: input.driverId,
    redemptionType: input.redemptionType,
    amount: input.amount,
  });

  const finalStatus = await dispatchRedemption(input, deps);
  await deps.repo.updateStatus(redemption.id, finalStatus);

  return { ...redemption, status: finalStatus };
}

async function dispatchRedemption(
  input: RedeemRewardInput,
  deps: RedeemRewardDeps
): Promise<"completed" | "failed"> {
  switch (input.redemptionType) {
    case "airtime":
      return dispatchAirtime(input, deps.vtuProvider);
    case "token_withdrawal":
      return dispatchTokenWithdrawal(input, deps.stacksTransferProvider);
    case "fuel_voucher":
    case "insurance_discount":
      // TS narrows `input.redemptionType` here but not the whole `input`
      // object's type (it's a plain interface, not a discriminated union),
      // so a type-only assertion documents what the switch already
      // guarantees at runtime.
      return dispatchVoucher(
        input as RedeemRewardInput & { redemptionType: "fuel_voucher" | "insurance_discount" },
        deps.voucherProvider
      );
    default: {
      // Exhaustiveness guard: the DB check constraint limits redemption_type
      // to the four values above, so this branch is unreachable in
      // production but keeps the switch total for TypeScript and tests.
      const exhaustive: never = input.redemptionType;
      throw new Error(`unsupported redemption_type: ${exhaustive as string}`);
    }
  }
}

async function dispatchAirtime(
  input: RedeemRewardInput,
  vtuProvider: VtuProvider
): Promise<"completed" | "failed"> {
  if (!input.phone) return "failed";
  try {
    await vtuProvider.topUpAirtime(input.phone, input.amount);
    return "completed";
  } catch {
    return "failed";
  }
}

async function dispatchTokenWithdrawal(
  input: RedeemRewardInput,
  stacksTransferProvider: StacksTransferProvider
): Promise<"completed" | "failed"> {
  if (!input.driverWalletAddress || !input.rewardPoolWalletAddress) return "failed";
  try {
    await stacksTransferProvider.transfer({
      fromWalletAddress: input.driverWalletAddress,
      toWalletAddress: input.rewardPoolWalletAddress,
      amount: input.amount,
    });
    return "completed";
  } catch {
    return "failed";
  }
}

async function dispatchVoucher(
  input: RedeemRewardInput & { redemptionType: "fuel_voucher" | "insurance_discount" },
  voucherProvider: VoucherProvider
): Promise<"completed" | "failed"> {
  try {
    await voucherProvider.issueVoucher({
      driverId: input.driverId,
      redemptionType: input.redemptionType,
      amount: input.amount,
    });
    return "completed";
  } catch {
    return "failed";
  }
}
