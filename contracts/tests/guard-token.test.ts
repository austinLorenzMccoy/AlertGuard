import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

const CONTRACT = "guard-token";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!; // contract-owner / default authorized-minter
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

describe("guard-token: SIP-010 read-only metadata", () => {
  it("get-name returns the reward token name", () => {
    const { result } = simnet.callReadOnlyFn(CONTRACT, "get-name", [], deployer);
    expect(result).toBeOk(Cl.stringAscii("AlertGuard Reward Token"));
  });

  it("get-symbol returns GUARD", () => {
    const { result } = simnet.callReadOnlyFn(CONTRACT, "get-symbol", [], deployer);
    expect(result).toBeOk(Cl.stringAscii("GUARD"));
  });

  it("get-decimals returns 6", () => {
    const { result } = simnet.callReadOnlyFn(CONTRACT, "get-decimals", [], deployer);
    expect(result).toBeOk(Cl.uint(6));
  });

  it("get-token-uri returns none", () => {
    const { result } = simnet.callReadOnlyFn(CONTRACT, "get-token-uri", [], deployer);
    expect(result).toBeOk(Cl.none());
  });

  it("get-total-supply is zero before any mint", () => {
    const { result } = simnet.callReadOnlyFn(CONTRACT, "get-total-supply", [], deployer);
    expect(result).toBeOk(Cl.uint(0));
  });

  it("get-balance for an address with no tokens is zero", () => {
    const { result } = simnet.callReadOnlyFn(CONTRACT, "get-balance", [Cl.principal(wallet1)], deployer);
    expect(result).toBeOk(Cl.uint(0));
  });

  it("get-contract-owner returns the deploying principal", () => {
    const { result } = simnet.callReadOnlyFn(CONTRACT, "get-contract-owner", [], deployer);
    expect(result).toBeOk(Cl.principal(deployer));
  });

  it("get-authorized-minter defaults to the contract owner", () => {
    const { result } = simnet.callReadOnlyFn(CONTRACT, "get-authorized-minter", [], deployer);
    expect(result).toBeOk(Cl.principal(deployer));
  });
});

describe("guard-token: mint (authorized-minter gated)", () => {
  it("allows the authorized minter (deployer, by default) to mint to a recipient", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "mint",
      [Cl.uint(1000), Cl.principal(wallet1)],
      deployer,
    );
    expect(result).toBeOk(Cl.bool(true));

    const balance = simnet.callReadOnlyFn(CONTRACT, "get-balance", [Cl.principal(wallet1)], deployer);
    expect(balance.result).toBeOk(Cl.uint(1000));

    const supply = simnet.callReadOnlyFn(CONTRACT, "get-total-supply", [], deployer);
    expect(supply.result).toBeOk(Cl.uint(1000));
  });

  it("rejects mint from a caller that is not the authorized minter", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "mint",
      [Cl.uint(1000), Cl.principal(wallet1)],
      wallet2, // not the authorized minter
    );
    expect(result).toBeErr(Cl.uint(101)); // err-not-authorized

    // balance must remain untouched
    const balance = simnet.callReadOnlyFn(CONTRACT, "get-balance", [Cl.principal(wallet1)], deployer);
    expect(balance.result).toBeOk(Cl.uint(0));
  });

  it("allows minting to a new authorized minter once reassigned, and blocks the old one", () => {
    const setRes = simnet.callPublicFn(
      CONTRACT,
      "set-authorized-minter",
      [Cl.principal(wallet3)],
      deployer,
    );
    expect(setRes.result).toBeOk(Cl.bool(true));

    const minterCheck = simnet.callReadOnlyFn(CONTRACT, "get-authorized-minter", [], deployer);
    expect(minterCheck.result).toBeOk(Cl.principal(wallet3));

    // new minter (wallet3) can now mint
    const mintByNew = simnet.callPublicFn(
      CONTRACT,
      "mint",
      [Cl.uint(500), Cl.principal(wallet2)],
      wallet3,
    );
    expect(mintByNew.result).toBeOk(Cl.bool(true));

    // deployer (former minter) can no longer mint
    const mintByOld = simnet.callPublicFn(
      CONTRACT,
      "mint",
      [Cl.uint(500), Cl.principal(wallet2)],
      deployer,
    );
    expect(mintByOld.result).toBeErr(Cl.uint(101));
  });
});

describe("guard-token: set-authorized-minter (owner-only)", () => {
  it("rejects set-authorized-minter from a non-owner caller", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "set-authorized-minter",
      [Cl.principal(wallet2)],
      wallet1, // not contract-owner
    );
    expect(result).toBeErr(Cl.uint(100)); // err-owner-only

    // authorized-minter must remain unchanged (still the deployer)
    const minterCheck = simnet.callReadOnlyFn(CONTRACT, "get-authorized-minter", [], deployer);
    expect(minterCheck.result).toBeOk(Cl.principal(deployer));
  });
});

describe("guard-token: transfer (sender-gated)", () => {
  beforeEach(() => {
    // fund wallet1 with 1000 GUARD for transfer tests
    simnet.callPublicFn(CONTRACT, "mint", [Cl.uint(1000), Cl.principal(wallet1)], deployer);
  });

  it("allows the token holder (tx-sender === sender) to transfer their own funds", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "transfer",
      [Cl.uint(400), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()],
      wallet1,
    );
    expect(result).toBeOk(Cl.bool(true));

    const senderBalance = simnet.callReadOnlyFn(CONTRACT, "get-balance", [Cl.principal(wallet1)], deployer);
    expect(senderBalance.result).toBeOk(Cl.uint(600));

    const recipientBalance = simnet.callReadOnlyFn(
      CONTRACT,
      "get-balance",
      [Cl.principal(wallet2)],
      deployer,
    );
    expect(recipientBalance.result).toBeOk(Cl.uint(400));
  });

  it("allows transfer with a memo", () => {
    const memo = new Uint8Array([1, 2, 3]);
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "transfer",
      [Cl.uint(100), Cl.principal(wallet1), Cl.principal(wallet2), Cl.some(Cl.buffer(memo))],
      wallet1,
    );
    expect(result).toBeOk(Cl.bool(true));
  });

  it("rejects transfer when tx-sender is not the funds' sender", () => {
    const { result } = simnet.callPublicFn(
      CONTRACT,
      "transfer",
      [Cl.uint(400), Cl.principal(wallet1), Cl.principal(wallet2), Cl.none()],
      wallet2, // impersonating wallet1 as the `sender` arg, but tx-sender is wallet2
    );
    expect(result).toBeErr(Cl.uint(101)); // err-not-authorized

    // balances must be untouched
    const senderBalance = simnet.callReadOnlyFn(CONTRACT, "get-balance", [Cl.principal(wallet1)], deployer);
    expect(senderBalance.result).toBeOk(Cl.uint(1000));
  });
});
