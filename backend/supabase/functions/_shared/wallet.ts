// Pure orchestration logic for the custodial wallet Edge Functions
// (generate-wallet, export-wallet-key, request-wallet-connect-challenge,
// connect-external-wallet). PRD reference: Smart Contract PRD Section 3
// ("Wallet Model") and Section 7 ("Security Model"); Section 10 Phase B
// items 5-7.
//
// Mirrors the DI shape of _shared/rewards.ts / _shared/redemptions.ts: every
// DB read/write is injected through a small repo interface so this module is
// testable without a real Supabase client, and the actual crypto lives in
// _shared/wallet-crypto.ts (imported, never reimplemented here).

import {
  encryptPrivateKey,
  decryptPrivateKey,
  generateStacksKeypair,
  verifyWalletOwnership,
  type StacksKeypairSource,
} from "./wallet-crypto.ts";

export type WalletType = "custodial" | "external";
export type WalletEventType = "generated" | "exported" | "connected_external" | "export_viewed";

export interface WalletKeyRow {
  id: string;
  driver_id: string;
  encrypted_private_key: string;
  encryption_key_id: string;
  wallet_type: WalletType;
  created_at?: string;
}

export interface WalletConnectChallengeRow {
  id: string;
  driver_id: string;
  nonce: string;
  expires_at: string;
  consumed_at: string | null;
}

export interface WalletEventLogger {
  logEvent(
    driverId: string,
    eventType: WalletEventType,
    metadata: Record<string, unknown>
  ): Promise<void>;
}

// ---------------------------------------------------------------------------
// generateAndStoreWallet — signup orchestration (Phase B item 5)
// ---------------------------------------------------------------------------

export interface WalletGenerationRepo extends WalletEventLogger {
  findWalletKey(driverId: string): Promise<Pick<WalletKeyRow, "id"> | null>;
  insertWalletKey(input: {
    driverId: string;
    encryptedPrivateKey: string;
    encryptionKeyId: string;
    walletType: "custodial";
  }): Promise<void>;
  updateWalletAddress(driverId: string, address: string): Promise<void>;
}

export interface GenerateAndStoreWalletDeps {
  repo: WalletGenerationRepo;
  /** 32-byte AES-256-GCM master key (WALLET_MASTER_ENCRYPTION_KEY, parsed via wallet-crypto.ts's parseMasterKey). */
  masterKey: Buffer;
  /** Which master key/version this encryption used — stored as wallet_keys.encryption_key_id for future rotation. */
  encryptionKeyId: string;
  /** Injectable for tests; production wiring omits this and gets the real `@stacks/transactions`-backed source. */
  keypairSource?: StacksKeypairSource;
  network?: "mainnet" | "testnet";
}

export interface GenerateAndStoreWalletResult {
  address: string;
}

/**
 * Signup orchestration: generates a Stacks keypair, encrypts the private
 * key, inserts the wallet_keys row, sets profiles.wallet_address, and logs a
 * `generated` wallet_events row.
 *
 * Guarded against double-generation: if the driver already has a
 * `wallet_keys` row, this throws rather than silently minting and storing a
 * second keypair. A silent second generation would be actively dangerous
 * here — profiles.wallet_address would get overwritten out from under any
 * balance already associated with the first address, and the old key would
 * become unreachable via any of this backend's own APIs (no
 * "list past wallets" endpoint exists). Throwing forces the caller
 * (generate-wallet/index.ts) to surface a clear 409-style error rather than
 * papering over what is very likely a client retry bug or a replay. This
 * mirrors how `wallet_keys.driver_id` is also UNIQUE at the DB layer
 * (20260101000006_wallet_infrastructure.sql) — belt and suspenders.
 */
export async function generateAndStoreWallet(
  driverId: string,
  deps: GenerateAndStoreWalletDeps
): Promise<GenerateAndStoreWalletResult> {
  const existing = await deps.repo.findWalletKey(driverId);
  if (existing) {
    throw new Error(`driver ${driverId} already has a wallet on file`);
  }

  const keypair = generateStacksKeypair(deps.keypairSource, deps.network ?? "testnet");
  const { encryptedPrivateKey, encryptionKeyId } = encryptPrivateKey(
    keypair.privateKey,
    deps.masterKey,
    deps.encryptionKeyId
  );

  await deps.repo.insertWalletKey({
    driverId,
    encryptedPrivateKey,
    encryptionKeyId,
    walletType: "custodial",
  });
  await deps.repo.updateWalletAddress(driverId, keypair.address);
  await deps.repo.logEvent(driverId, "generated", { address: keypair.address });

  return { address: keypair.address };
}

// ---------------------------------------------------------------------------
// exportWalletKey — wallet export orchestration (Phase B item 6)
// ---------------------------------------------------------------------------

export interface WalletExportRepo extends WalletEventLogger {
  findWalletKey(
    driverId: string
  ): Promise<Pick<WalletKeyRow, "encrypted_private_key" | "encryption_key_id" | "wallet_type"> | null>;
}

export interface ExportWalletKeyDeps {
  repo: WalletExportRepo;
  /** Looks up the correct 32-byte master key for a given wallet_keys.encryption_key_id (supports rotation: old rows may be under an older key id). */
  resolveMasterKey: (encryptionKeyId: string) => Buffer;
}

export type ExportWalletKeyResult =
  | { status: "exported"; privateKey: string }
  | { status: "error"; reason: "wallet_not_found" | "not_custodial" };

/**
 * Export orchestration: decrypts and returns a driver's custodial private
 * key, and logs an `exported` audit event (PRD Section 3: "log the export
 * event for the driver's own audit trail").
 *
 * This function's responsibility ends at "decrypt once, log it, return it" —
 * making that a true one-time-viewable UX (e.g. "shown once, then
 * dismissed, never re-displayable from history") is a client/UI concern:
 * a stateless HTTP endpoint cannot know whether or how long the caller
 * displayed the value it returned. What this backend *can* and does
 * guarantee is that every export is logged, so a driver can always see in
 * their own `wallet_events` audit trail how many times (and when) their key
 * was exported — the client-side "one-time-viewable" modal is documented as
 * the enforcement point in WALLET_INTEGRATION.md.
 *
 * Requires the caller to already be authenticated as `driverId` — that is
 * the Edge Function wiring layer's job (export-wallet-key/index.ts), via
 * the same authorizeCaller()/driver_id-match pattern as every other
 * client-facing function in this backend (see backend/README.md's
 * "Auth model").
 */
export async function exportWalletKey(
  driverId: string,
  deps: ExportWalletKeyDeps
): Promise<ExportWalletKeyResult> {
  const walletKey = await deps.repo.findWalletKey(driverId);
  if (!walletKey) {
    return { status: "error", reason: "wallet_not_found" };
  }
  if (walletKey.wallet_type !== "custodial") {
    // A driver who has already connected an external wallet has no
    // AlertGuard-held key left to export (Phase B item 7 deletes it) — this
    // is a distinct, more specific failure than "no wallet at all".
    return { status: "error", reason: "not_custodial" };
  }

  const masterKey = deps.resolveMasterKey(walletKey.encryption_key_id);
  const privateKey = decryptPrivateKey(walletKey.encrypted_private_key, masterKey);

  await deps.repo.logEvent(driverId, "exported", {});

  return { status: "exported", privateKey };
}

// ---------------------------------------------------------------------------
// connectExternalWallet — "connect external wallet" orchestration (Phase B item 7)
// ---------------------------------------------------------------------------

export interface WalletConnectRepo extends WalletEventLogger {
  findChallenge(driverId: string, nonce: string): Promise<WalletConnectChallengeRow | null>;
  consumeChallenge(challengeId: string): Promise<void>;
  updateWalletAddress(driverId: string, address: string): Promise<void>;
  findWalletKey(driverId: string): Promise<Pick<WalletKeyRow, "wallet_type"> | null>;
  deleteWalletKey(driverId: string): Promise<void>;
}

export interface ConnectExternalWalletInput {
  driverId: string;
  address: string;
  nonce: string;
  signature: string;
}

export interface ConnectExternalWalletDeps {
  repo: WalletConnectRepo;
  /** Injectable clock (ms since epoch) so expiry is deterministic in tests. */
  nowMs: number;
  /** Injectable for tests; production wiring omits this and gets the real verifyWalletOwnership. */
  verify?: (address: string, nonce: string, signature: string) => boolean;
}

export type ConnectExternalWalletResult =
  | { status: "connected"; address: string; replacedCustodialWallet: boolean }
  | {
      status: "error";
      reason:
        | "challenge_not_found"
        | "challenge_expired"
        | "challenge_already_consumed"
        | "invalid_signature";
    };

/**
 * Verifies the driver signed the previously-issued challenge nonce with the
 * external wallet they claim to own (PRD Section 3 step 4c: "driver signs a
 * challenge message with an external wallet ... to prove ownership"), then:
 *   1. marks the challenge consumed (anti-replay — a given nonce can only
 *      ever complete a connect flow once),
 *   2. replaces profiles.wallet_address with the newly-proven address,
 *   3. deletes AlertGuard's copy of the driver's key — but ONLY if their
 *      existing wallet_keys row is `custodial`. A driver who is re-linking a
 *      *different* external wallet (wallet_type already 'external') has no
 *      AlertGuard-held key to delete, so this step is skipped for them —
 *      deleting nothing is correct, not a bug.
 *   4. logs a `connected_external` audit event with the new address (never
 *      key material).
 */
export async function connectExternalWallet(
  input: ConnectExternalWalletInput,
  deps: ConnectExternalWalletDeps
): Promise<ConnectExternalWalletResult> {
  const challenge = await deps.repo.findChallenge(input.driverId, input.nonce);
  if (!challenge) {
    return { status: "error", reason: "challenge_not_found" };
  }
  if (challenge.consumed_at) {
    return { status: "error", reason: "challenge_already_consumed" };
  }
  if (new Date(challenge.expires_at).getTime() <= deps.nowMs) {
    return { status: "error", reason: "challenge_expired" };
  }

  const verify = deps.verify ?? verifyWalletOwnership;
  const isValid = verify(input.address, input.nonce, input.signature);
  if (!isValid) {
    return { status: "error", reason: "invalid_signature" };
  }

  await deps.repo.consumeChallenge(challenge.id);
  await deps.repo.updateWalletAddress(input.driverId, input.address);

  const existingKey = await deps.repo.findWalletKey(input.driverId);
  let replacedCustodialWallet = false;
  if (existingKey && existingKey.wallet_type === "custodial") {
    await deps.repo.deleteWalletKey(input.driverId);
    replacedCustodialWallet = true;
  }

  await deps.repo.logEvent(input.driverId, "connected_external", { address: input.address });

  return { status: "connected", address: input.address, replacedCustodialWallet };
}
