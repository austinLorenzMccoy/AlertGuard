import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const SETTLEMENT = "reward-settlement";
const TOKEN = "guard-token";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!; // contract-owner of both contracts
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const settlementContractPrincipal = `${deployer}.${SETTLEMENT}`;

/** Builds a distinct 36-byte reward-id buffer (stand-in for a Supabase rewards.id UUID). */
function rewardId(seed: number): Uint8Array {
  const buf = new Uint8Array(36);
  buf.fill(seed % 256);
  return buf;
}

beforeEach(() => {
  // Wire guard-token's authorized-minter to the reward-settlement contract,
  // exactly as production deployment must (PRD Section 4/5): only
  // reward-settlement is ever allowed to mint GUARD.
  const res = simnet.callPublicFn(
    TOKEN,
    "set-authorized-minter",
    [Cl.principal(settlementContractPrincipal)],
    deployer,
  );
  expect(res.result).toBeOk(Cl.bool(true));
});

describe("reward-settlement: initial state / read-only getters", () => {
  it("get-daily-cap starts at the PRD default (5,000 GUARD/day at 6 decimals)", () => {
    const { result } = simnet.callReadOnlyFn(SETTLEMENT, "get-daily-cap", [], deployer);
    expect(result).toBeOk(Cl.uint(5_000_000_000));
  });

  it("get-minted-today starts at zero", () => {
    const { result } = simnet.callReadOnlyFn(SETTLEMENT, "get-minted-today", [], deployer);
    expect(result).toBeOk(Cl.uint(0));
  });

  it("get-blocks-per-day exposes the documented ~1-day approximation", () => {
    const { result } = simnet.callReadOnlyFn(SETTLEMENT, "get-blocks-per-day", [], deployer);
    expect(result).toBeOk(Cl.uint(144));
  });

  it("get-contract-owner returns the deploying principal", () => {
    const { result } = simnet.callReadOnlyFn(SETTLEMENT, "get-contract-owner", [], deployer);
    expect(result).toBeOk(Cl.principal(deployer));
  });

  it("get-last-reset-block is initialised to the deploy-time burn height", () => {
    const { result } = simnet.callReadOnlyFn(SETTLEMENT, "get-last-reset-block", [], deployer);
    expect(result).toBeOk(Cl.uint(simnet.burnBlockHeight));
  });

  it("is-reward-settled is false for a reward-id that was never settled", () => {
    const { result } = simnet.callReadOnlyFn(
      SETTLEMENT,
      "is-reward-settled",
      [Cl.buffer(rewardId(1))],
      deployer,
    );
    expect(result).toBeOk(Cl.bool(false));
  });
});

describe("reward-settlement: settle-reward happy path", () => {
  it("mints the reward amount to the recipient and marks the reward settled", () => {
    const id = rewardId(1);
    const amount = 1000;

    const { result } = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(id), Cl.uint(amount), Cl.principal(wallet1)],
      deployer,
    );
    expect(result).toBeOk(Cl.bool(true));

    const balance = simnet.callReadOnlyFn(TOKEN, "get-balance", [Cl.principal(wallet1)], deployer);
    expect(balance.result).toBeOk(Cl.uint(amount));

    const settled = simnet.callReadOnlyFn(SETTLEMENT, "is-reward-settled", [Cl.buffer(id)], deployer);
    expect(settled.result).toBeOk(Cl.bool(true));

    const mintedToday = simnet.callReadOnlyFn(SETTLEMENT, "get-minted-today", [], deployer);
    expect(mintedToday.result).toBeOk(Cl.uint(amount));
  });

  it("accumulates minted-today across multiple distinct settlements", () => {
    simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(1)), Cl.uint(1000), Cl.principal(wallet1)],
      deployer,
    );
    simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(2)), Cl.uint(2500), Cl.principal(wallet2)],
      deployer,
    );

    const mintedToday = simnet.callReadOnlyFn(SETTLEMENT, "get-minted-today", [], deployer);
    expect(mintedToday.result).toBeOk(Cl.uint(3500));
  });
});

describe("reward-settlement: owner-only access control", () => {
  it("rejects settle-reward from a non-owner caller", () => {
    const { result } = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(1)), Cl.uint(1000), Cl.principal(wallet1)],
      wallet1, // not contract-owner
    );
    expect(result).toBeErr(Cl.uint(200)); // err-owner-only

    const settled = simnet.callReadOnlyFn(
      SETTLEMENT,
      "is-reward-settled",
      [Cl.buffer(rewardId(1))],
      deployer,
    );
    expect(settled.result).toBeOk(Cl.bool(false));
  });

  it("rejects set-daily-cap from a non-owner caller", () => {
    const { result } = simnet.callPublicFn(SETTLEMENT, "set-daily-cap", [Cl.uint(1)], wallet1);
    expect(result).toBeErr(Cl.uint(200)); // err-owner-only

    const cap = simnet.callReadOnlyFn(SETTLEMENT, "get-daily-cap", [], deployer);
    expect(cap.result).toBeOk(Cl.uint(5_000_000_000)); // unchanged
  });

  it("allows the owner to change the daily cap", () => {
    const { result } = simnet.callPublicFn(SETTLEMENT, "set-daily-cap", [Cl.uint(42)], deployer);
    // `var-set` itself evaluates to `true`, so `(ok (var-set ...))` is `(ok true)`;
    // the new value is confirmed via the get-daily-cap getter below.
    expect(result).toBeOk(Cl.bool(true));

    const cap = simnet.callReadOnlyFn(SETTLEMENT, "get-daily-cap", [], deployer);
    expect(cap.result).toBeOk(Cl.uint(42));
  });
});

describe("reward-settlement: double-settlement prevention", () => {
  it("rejects settling the same reward-id twice", () => {
    const id = rewardId(7);

    const first = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(id), Cl.uint(1000), Cl.principal(wallet1)],
      deployer,
    );
    expect(first.result).toBeOk(Cl.bool(true));

    const second = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(id), Cl.uint(1000), Cl.principal(wallet1)],
      deployer,
    );
    expect(second.result).toBeErr(Cl.uint(202)); // err-already-settled

    // balance must reflect only the first, successful settlement
    const balance = simnet.callReadOnlyFn(TOKEN, "get-balance", [Cl.principal(wallet1)], deployer);
    expect(balance.result).toBeOk(Cl.uint(1000));

    const mintedToday = simnet.callReadOnlyFn(SETTLEMENT, "get-minted-today", [], deployer);
    expect(mintedToday.result).toBeOk(Cl.uint(1000));
  });
});

describe("reward-settlement: daily-cap enforcement", () => {
  it("rejects a settlement that would push minted-today over the daily cap", () => {
    simnet.callPublicFn(SETTLEMENT, "set-daily-cap", [Cl.uint(1000)], deployer);

    const { result } = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(1)), Cl.uint(1001), Cl.principal(wallet1)],
      deployer,
    );
    expect(result).toBeErr(Cl.uint(201)); // err-daily-cap-exceeded

    // nothing should have been minted or marked settled
    const balance = simnet.callReadOnlyFn(TOKEN, "get-balance", [Cl.principal(wallet1)], deployer);
    expect(balance.result).toBeOk(Cl.uint(0));
    const settled = simnet.callReadOnlyFn(
      SETTLEMENT,
      "is-reward-settled",
      [Cl.buffer(rewardId(1))],
      deployer,
    );
    expect(settled.result).toBeOk(Cl.bool(false));
    const mintedToday = simnet.callReadOnlyFn(SETTLEMENT, "get-minted-today", [], deployer);
    expect(mintedToday.result).toBeOk(Cl.uint(0));
  });

  it("rejects a second settlement once the cap has already been reached", () => {
    simnet.callPublicFn(SETTLEMENT, "set-daily-cap", [Cl.uint(1000)], deployer);

    const first = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(1)), Cl.uint(1000), Cl.principal(wallet1)],
      deployer,
    );
    expect(first.result).toBeOk(Cl.bool(true));

    const second = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(2)), Cl.uint(1), Cl.principal(wallet1)],
      deployer,
    );
    expect(second.result).toBeErr(Cl.uint(201));
  });

  it("allows a settlement that lands exactly on the daily cap boundary", () => {
    simnet.callPublicFn(SETTLEMENT, "set-daily-cap", [Cl.uint(1000)], deployer);

    const { result } = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(1)), Cl.uint(1000), Cl.principal(wallet1)],
      deployer,
    );
    expect(result).toBeOk(Cl.bool(true));

    const mintedToday = simnet.callReadOnlyFn(SETTLEMENT, "get-minted-today", [], deployer);
    expect(mintedToday.result).toBeOk(Cl.uint(1000));

    // one more unit pushes past the cap, and must fail
    const overflow = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(2)), Cl.uint(1), Cl.principal(wallet1)],
      deployer,
    );
    expect(overflow.result).toBeErr(Cl.uint(201));
  });
});

describe("reward-settlement: daily-reset behaviour (burn-block-height based)", () => {
  it("does NOT reset minted-today before ~144 burn blocks (one approximated day) have elapsed", () => {
    simnet.callPublicFn(SETTLEMENT, "set-daily-cap", [Cl.uint(1000)], deployer);
    simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(1)), Cl.uint(1000), Cl.principal(wallet1)],
      deployer,
    );

    // advance fewer than blocks-per-day (144) burn blocks
    simnet.mineEmptyBurnBlocks(100);

    const stillCapped = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(2)), Cl.uint(1), Cl.principal(wallet1)],
      deployer,
    );
    expect(stillCapped.result).toBeErr(Cl.uint(201)); // cap still enforced, no reset yet

    const mintedToday = simnet.callReadOnlyFn(SETTLEMENT, "get-minted-today", [], deployer);
    expect(mintedToday.result).toBeOk(Cl.uint(1000)); // unchanged
  });

  it("resets minted-today and advances last-reset-block once ~144 burn blocks have elapsed", () => {
    simnet.callPublicFn(SETTLEMENT, "set-daily-cap", [Cl.uint(1000)], deployer);
    simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(1)), Cl.uint(1000), Cl.principal(wallet1)],
      deployer,
    );

    const resetBlockBefore = simnet.callReadOnlyFn(SETTLEMENT, "get-last-reset-block", [], deployer);

    // advance a full "day" worth of burn blocks (>= blocks-per-day)
    simnet.mineEmptyBurnBlocks(144);

    const afterReset = simnet.callPublicFn(
      SETTLEMENT,
      "settle-reward",
      [Cl.buffer(rewardId(2)), Cl.uint(1000), Cl.principal(wallet1)],
      deployer,
    );
    expect(afterReset.result).toBeOk(Cl.bool(true)); // succeeds: minted-today was reset to 0

    const mintedToday = simnet.callReadOnlyFn(SETTLEMENT, "get-minted-today", [], deployer);
    expect(mintedToday.result).toBeOk(Cl.uint(1000)); // only the new day's amount

    const resetBlockAfter = simnet.callReadOnlyFn(SETTLEMENT, "get-last-reset-block", [], deployer);
    expect(resetBlockAfter.result).not.toEqual(resetBlockBefore.result);

    // both settlements landed, total balance across the two "days" is 2000
    const balance = simnet.callReadOnlyFn(TOKEN, "get-balance", [Cl.principal(wallet1)], deployer);
    expect(balance.result).toBeOk(Cl.uint(2000));
  });
});
