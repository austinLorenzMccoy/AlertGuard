import { describe, it, expect, vi } from "vitest";
import {
  generateAndStoreWallet,
  exportWalletKey,
  connectExternalWallet,
  type WalletGenerationRepo,
  type WalletExportRepo,
  type WalletConnectRepo,
  type WalletConnectChallengeRow,
  type WalletKeyRow,
} from "../../supabase/functions/_shared/wallet.ts";
import { encryptPrivateKey, type StacksKeypairSource } from "../../supabase/functions/_shared/wallet-crypto.ts";

function makeMasterKey(byte = 7): Buffer {
  return Buffer.alloc(32, byte);
}

const fixedKeypairSource: StacksKeypairSource = {
  randomPrivateKeyBytes: () => Buffer.alloc(32, 42),
};

describe("generateAndStoreWallet", () => {
  function makeRepo(overrides: Partial<WalletGenerationRepo> = {}): WalletGenerationRepo {
    return {
      findWalletKey: vi.fn().mockResolvedValue(null),
      insertWalletKey: vi.fn().mockResolvedValue(undefined),
      updateWalletAddress: vi.fn().mockResolvedValue(undefined),
      logEvent: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("generates a keypair, encrypts it, stores it, sets the wallet address, and logs a 'generated' event", async () => {
    const repo = makeRepo();
    const result = await generateAndStoreWallet("driver-1", {
      repo,
      masterKey: makeMasterKey(),
      encryptionKeyId: "key-v1",
      keypairSource: fixedKeypairSource,
    });

    expect(result.address.startsWith("ST")).toBe(true);
    expect(repo.findWalletKey).toHaveBeenCalledWith("driver-1");
    expect(repo.insertWalletKey).toHaveBeenCalledTimes(1);
    const insertCall = (repo.insertWalletKey as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(insertCall.driverId).toBe("driver-1");
    expect(insertCall.walletType).toBe("custodial");
    expect(insertCall.encryptionKeyId).toBe("key-v1");
    expect(typeof insertCall.encryptedPrivateKey).toBe("string");
    expect(repo.updateWalletAddress).toHaveBeenCalledWith("driver-1", result.address);
    expect(repo.logEvent).toHaveBeenCalledWith("driver-1", "generated", { address: result.address });
  });

  it("derives a mainnet address when network: 'mainnet' is passed through", async () => {
    const repo = makeRepo();
    const result = await generateAndStoreWallet("driver-1", {
      repo,
      masterKey: makeMasterKey(),
      encryptionKeyId: "key-v1",
      keypairSource: fixedKeypairSource,
      network: "mainnet",
    });
    expect(result.address.startsWith("SP")).toBe(true);
  });

  it("throws and never writes anything when the driver already has a wallet on file", async () => {
    const repo = makeRepo({ findWalletKey: vi.fn().mockResolvedValue({ id: "existing-key-id" }) });

    await expect(
      generateAndStoreWallet("driver-1", {
        repo,
        masterKey: makeMasterKey(),
        encryptionKeyId: "key-v1",
        keypairSource: fixedKeypairSource,
      })
    ).rejects.toThrow(/already has a wallet/);

    expect(repo.insertWalletKey).not.toHaveBeenCalled();
    expect(repo.updateWalletAddress).not.toHaveBeenCalled();
    expect(repo.logEvent).not.toHaveBeenCalled();
  });
});

describe("exportWalletKey", () => {
  function makeRepo(overrides: Partial<WalletExportRepo> = {}): WalletExportRepo {
    return {
      findWalletKey: vi.fn().mockResolvedValue(null),
      logEvent: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it("decrypts and returns the custodial private key, and logs an 'exported' event", async () => {
    const masterKey = makeMasterKey();
    const { encryptedPrivateKey, encryptionKeyId } = encryptPrivateKey("plaintext-priv-key", masterKey, "key-v1");

    const repo = makeRepo({
      findWalletKey: vi.fn().mockResolvedValue({
        encrypted_private_key: encryptedPrivateKey,
        encryption_key_id: encryptionKeyId,
        wallet_type: "custodial",
      } satisfies Pick<WalletKeyRow, "encrypted_private_key" | "encryption_key_id" | "wallet_type">),
    });

    const result = await exportWalletKey("driver-1", {
      repo,
      resolveMasterKey: vi.fn().mockReturnValue(masterKey),
    });

    expect(result).toEqual({ status: "exported", privateKey: "plaintext-priv-key" });
    expect(repo.logEvent).toHaveBeenCalledWith("driver-1", "exported", {});
  });

  it("returns wallet_not_found and logs nothing when the driver has no wallet_keys row", async () => {
    const repo = makeRepo();
    const result = await exportWalletKey("driver-1", {
      repo,
      resolveMasterKey: vi.fn(),
    });

    expect(result).toEqual({ status: "error", reason: "wallet_not_found" });
    expect(repo.logEvent).not.toHaveBeenCalled();
  });

  it("returns not_custodial and logs nothing when the driver's wallet is external", async () => {
    const repo = makeRepo({
      findWalletKey: vi.fn().mockResolvedValue({
        encrypted_private_key: "irrelevant",
        encryption_key_id: "irrelevant",
        wallet_type: "external",
      }),
    });

    const result = await exportWalletKey("driver-1", {
      repo,
      resolveMasterKey: vi.fn(),
    });

    expect(result).toEqual({ status: "error", reason: "not_custodial" });
    expect(repo.logEvent).not.toHaveBeenCalled();
  });
});

describe("connectExternalWallet", () => {
  function makeChallenge(overrides: Partial<WalletConnectChallengeRow> = {}): WalletConnectChallengeRow {
    return {
      id: "challenge-1",
      driver_id: "driver-1",
      nonce: "the-nonce",
      expires_at: new Date(2_000_000_000_000).toISOString(),
      consumed_at: null,
      ...overrides,
    };
  }

  function makeRepo(overrides: Partial<WalletConnectRepo> = {}): WalletConnectRepo {
    return {
      findChallenge: vi.fn().mockResolvedValue(makeChallenge()),
      consumeChallenge: vi.fn().mockResolvedValue(undefined),
      updateWalletAddress: vi.fn().mockResolvedValue(undefined),
      findWalletKey: vi.fn().mockResolvedValue(null),
      deleteWalletKey: vi.fn().mockResolvedValue(undefined),
      logEvent: vi.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  const baseInput = {
    driverId: "driver-1",
    address: "ST1EXTERNALADDRESSXXXXXXXXXXXXXXXXXXXXXX",
    nonce: "the-nonce",
    signature: "sig",
  };

  it("connects successfully, consumes the challenge, updates the address, deletes a custodial key, and logs the event", async () => {
    const repo = makeRepo({
      findWalletKey: vi.fn().mockResolvedValue({ wallet_type: "custodial" }),
    });

    const result = await connectExternalWallet(baseInput, {
      repo,
      nowMs: 1_000_000_000_000,
      verify: vi.fn().mockReturnValue(true),
    });

    expect(result).toEqual({ status: "connected", address: baseInput.address, replacedCustodialWallet: true });
    expect(repo.consumeChallenge).toHaveBeenCalledWith("challenge-1");
    expect(repo.updateWalletAddress).toHaveBeenCalledWith("driver-1", baseInput.address);
    expect(repo.deleteWalletKey).toHaveBeenCalledWith("driver-1");
    expect(repo.logEvent).toHaveBeenCalledWith("driver-1", "connected_external", { address: baseInput.address });
  });

  it("connects successfully without deleting anything when the driver has no existing wallet_keys row", async () => {
    const repo = makeRepo({ findWalletKey: vi.fn().mockResolvedValue(null) });

    const result = await connectExternalWallet(baseInput, {
      repo,
      nowMs: 1_000_000_000_000,
      verify: vi.fn().mockReturnValue(true),
    });

    expect(result).toEqual({ status: "connected", address: baseInput.address, replacedCustodialWallet: false });
    expect(repo.deleteWalletKey).not.toHaveBeenCalled();
  });

  it("connects successfully without deleting anything when the driver is re-linking a different external wallet", async () => {
    const repo = makeRepo({ findWalletKey: vi.fn().mockResolvedValue({ wallet_type: "external" }) });

    const result = await connectExternalWallet(baseInput, {
      repo,
      nowMs: 1_000_000_000_000,
      verify: vi.fn().mockReturnValue(true),
    });

    expect(result).toEqual({ status: "connected", address: baseInput.address, replacedCustodialWallet: false });
    expect(repo.deleteWalletKey).not.toHaveBeenCalled();
  });

  it("returns challenge_not_found and touches nothing else when no matching challenge exists", async () => {
    const repo = makeRepo({ findChallenge: vi.fn().mockResolvedValue(null) });

    const result = await connectExternalWallet(baseInput, { repo, nowMs: 1_000_000_000_000 });

    expect(result).toEqual({ status: "error", reason: "challenge_not_found" });
    expect(repo.consumeChallenge).not.toHaveBeenCalled();
    expect(repo.updateWalletAddress).not.toHaveBeenCalled();
  });

  it("returns challenge_already_consumed when the challenge was already used", async () => {
    const repo = makeRepo({
      findChallenge: vi.fn().mockResolvedValue(makeChallenge({ consumed_at: new Date().toISOString() })),
    });

    const result = await connectExternalWallet(baseInput, { repo, nowMs: 1_000_000_000_000 });

    expect(result).toEqual({ status: "error", reason: "challenge_already_consumed" });
    expect(repo.consumeChallenge).not.toHaveBeenCalled();
  });

  it("returns challenge_expired when now is past expires_at", async () => {
    const repo = makeRepo({
      findChallenge: vi
        .fn()
        .mockResolvedValue(makeChallenge({ expires_at: new Date(1_000_000_000_000).toISOString() })),
    });

    const result = await connectExternalWallet(baseInput, { repo, nowMs: 1_000_000_000_001 });

    expect(result).toEqual({ status: "error", reason: "challenge_expired" });
    expect(repo.consumeChallenge).not.toHaveBeenCalled();
  });

  it("returns invalid_signature and consumes nothing when verification fails", async () => {
    const repo = makeRepo();

    const result = await connectExternalWallet(baseInput, {
      repo,
      nowMs: 1_000_000_000_000,
      verify: vi.fn().mockReturnValue(false),
    });

    expect(result).toEqual({ status: "error", reason: "invalid_signature" });
    expect(repo.consumeChallenge).not.toHaveBeenCalled();
    expect(repo.updateWalletAddress).not.toHaveBeenCalled();
    expect(repo.logEvent).not.toHaveBeenCalled();
  });

  it("uses the real verifyWalletOwnership by default when no verify override is injected", async () => {
    const repo = makeRepo();

    // No `verify` deps passed — exercises the `deps.verify ?? verifyWalletOwnership`
    // default wiring against a signature that cannot possibly be valid,
    // proving the real function (not a stub) is what gets called.
    const result = await connectExternalWallet(baseInput, { repo, nowMs: 1_000_000_000_000 });

    expect(result).toEqual({ status: "error", reason: "invalid_signature" });
  });
});
