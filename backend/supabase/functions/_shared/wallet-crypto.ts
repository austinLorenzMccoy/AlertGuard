// Pure cryptographic primitives backing the custodial wallet infrastructure.
// PRD reference: Smart Contract PRD Section 3 ("Wallet Model") and Section 7
// ("Security Model"); Section 10 Phase B items 5-7.
//
// Three independent concerns live here:
//
//   1. Envelope encryption of a driver's custodial private key at rest
//      (encryptPrivateKey / decryptPrivateKey), using Node's built-in
//      `node:crypto` (AES-256-GCM) — authenticated encryption, no extra
//      dependency, and `node:crypto` runs identically under Node/Vitest and
//      under Deno (which implements the same builtin module), so this half
//      of the file needs no dependency injection for portability.
//
//   2. Stacks keypair generation (generateStacksKeypair) — kept behind an
//      injectable `StacksKeypairSource` (mirroring _shared/payout.ts's
//      `StacksTransactionsSdk` pattern) purely so tests can supply a
//      deterministic key instead of real randomness. The real source, wired
//      in generate-wallet/index.ts (Deno), wraps `@stacks/transactions`'
//      `makeRandomPrivKey` / `getAddressFromPrivateKey`.
//
//   3. Wallet-ownership signature verification (verifyWalletOwnership) — a
//      pure, deterministic, OFFLINE cryptographic check (no network I/O),
//      unlike payout.ts's Stacks calls. Because it needs no network and is
//      genuinely portable JS, this module imports `@stacks/transactions` and
//      `@stacks/encryption` directly as real npm dependencies (see
//      package.json) rather than injecting them — there is no testability
//      reason to inject a pure function, and the task's "test this for real"
//      requirement is best met by running the actual signature-verification
//      algorithm in tests, not a mock of it. This is a deliberate departure
//      from payout.ts's zero-import style, which exists specifically to keep
//      *network-bound* Stacks calls out of the pure-logic layer; it does not
//      apply here. (Caveat for a real Deno deployment: this bare npm
//      specifier needs a `deno.json` import map entry or an `npm:` specifier
//      swap for the Supabase Edge Runtime to resolve it — noted here since it
//      is a genuine difference from every other _shared module, which import
//      nothing external at all. Deno itself was not installed in this
//      environment to verify end-to-end; see backend/README.md.)

import { randomBytes, createCipheriv, createDecipheriv, createHash } from "node:crypto";
import {
  makeRandomPrivKey,
  createStacksPrivateKey,
  privateKeyToString,
  getAddressFromPrivateKey,
  getAddressFromPublicKey,
  publicKeyFromSignatureRsv,
  createMessageSignature,
  TransactionVersion,
  PubKeyEncoding,
  type StacksPrivateKey,
} from "@stacks/transactions";
import { hashMessage } from "@stacks/encryption";

// ---------------------------------------------------------------------------
// 1. Envelope encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96-bit IV, the GCM-recommended size
const MASTER_KEY_LENGTH_BYTES = 32; // AES-256

export interface EncryptedPrivateKey {
  /** "<iv>:<authTag>:<ciphertext>", each segment base64 — packed into the single `wallet_keys.encrypted_private_key` text column. */
  encryptedPrivateKey: string;
  encryptionKeyId: string;
}

/**
 * Encrypts a plaintext Stacks private key with AES-256-GCM under the given
 * master key. `keyId` is stored alongside the ciphertext (as
 * `wallet_keys.encryption_key_id`) so a future key rotation can tell which
 * master key/version to decrypt a given row with, without re-encrypting
 * every row atomically.
 */
export function encryptPrivateKey(
  plaintextKey: string,
  masterKey: Buffer,
  keyId: string
): EncryptedPrivateKey {
  assertMasterKeyLength(masterKey);

  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextKey, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedPrivateKey: [
      iv.toString("base64"),
      authTag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(":"),
    encryptionKeyId: keyId,
  };
}

/**
 * Decrypts a `wallet_keys.encrypted_private_key` value produced by
 * `encryptPrivateKey`. Throws if the payload is malformed, or if the
 * ciphertext/authTag has been tampered with (GCM's auth tag check fails) —
 * this is authenticated encryption, not mere obfuscation: any bit flip in
 * either the ciphertext or the auth tag causes `decipher.final()` to throw
 * rather than silently returning corrupted plaintext.
 */
export function decryptPrivateKey(encryptedPrivateKey: string, masterKey: Buffer): string {
  assertMasterKeyLength(masterKey);

  const parts = encryptedPrivateKey.split(":");
  if (parts.length !== 3) {
    throw new Error("malformed encrypted_private_key payload: expected '<iv>:<authTag>:<ciphertext>'");
  }
  const [ivB64, authTagB64, ciphertextB64] = parts;

  const decipher = createDecipheriv(ALGORITHM, masterKey, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

function assertMasterKeyLength(masterKey: Buffer): void {
  if (masterKey.length !== MASTER_KEY_LENGTH_BYTES) {
    throw new RangeError(
      `master key must be exactly ${MASTER_KEY_LENGTH_BYTES} bytes for AES-256-GCM, got ${masterKey.length}`
    );
  }
}

/**
 * Parses `WALLET_MASTER_ENCRYPTION_KEY` (hex or base64) into the 32-byte
 * Buffer `encryptPrivateKey`/`decryptPrivateKey` expect. Generate a value
 * with `openssl rand -hex 32`; see .env.example.
 */
export function parseMasterKey(raw: string): Buffer {
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === MASTER_KEY_LENGTH_BYTES) {
    return decoded;
  }
  throw new Error(
    "WALLET_MASTER_ENCRYPTION_KEY must be a 32-byte key, hex (64 chars) or base64 encoded"
  );
}

// ---------------------------------------------------------------------------
// 2. Stacks keypair generation
// ---------------------------------------------------------------------------

export interface StacksKeypair {
  /** Hex-encoded private key, COMPRESSED marker included (33 bytes / 66 hex chars) — matches the format real Stacks wallets (Leather/Xverse) use, so the derived address is a standard single-sig P2PKH-compressed address. */
  privateKey: string;
  /** Stacks address derived from the private key, for the given network. */
  address: string;
}

export interface StacksKeypairSource {
  /** Returns raw random bytes; real source uses Node's crypto.randomBytes / the SDK's own RNG. */
  randomPrivateKeyBytes(): Uint8Array;
}

/** Production keypair source: delegates to `@stacks/transactions`' own CSPRNG-backed key generation. */
export const productionStacksKeypairSource: StacksKeypairSource = {
  randomPrivateKeyBytes() {
    // makeRandomPrivKey() defaults to an UNcompressed key; we only use its
    // 32 random bytes here and build a compressed StacksPrivateKey ourselves
    // (see generateStacksKeypair) so the derived address matches what a real
    // wallet extension would produce.
    return makeRandomPrivKey().data.slice(0, 32);
  },
};

/**
 * Generates a Stacks keypair for a driver's custodial wallet. Behind the
 * injectable `StacksKeypairSource` so tests can supply deterministic bytes
 * instead of real randomness; production wiring (generate-wallet/index.ts)
 * uses `productionStacksKeypairSource`, built from the real
 * `@stacks/transactions` import.
 *
 * The private key is constructed with the compressed-key marker byte (0x01)
 * appended, matching the format Leather/Xverse use for standard single-sig
 * addresses — an uncompressed-key address (the library's own default) would
 * be non-standard and wouldn't match what a driver sees if they ever import
 * the exported key into a real wallet app.
 */
export function generateStacksKeypair(
  source: StacksKeypairSource = productionStacksKeypairSource,
  network: "mainnet" | "testnet" = "testnet"
): StacksKeypair {
  const rawBytes = source.randomPrivateKeyBytes();
  if (rawBytes.length !== 32) {
    throw new RangeError(`randomPrivateKeyBytes() must return 32 bytes, got ${rawBytes.length}`);
  }

  const compressedHex = Buffer.from(rawBytes).toString("hex") + "01";
  const privateKey: StacksPrivateKey = createStacksPrivateKey(compressedHex);
  const privateKeyHex = privateKeyToString(privateKey);

  const txVersion =
    network === "mainnet" ? TransactionVersion.Mainnet : TransactionVersion.Testnet;
  const address = getAddressFromPrivateKey(privateKeyHex, txVersion);

  return { privateKey: privateKeyHex, address };
}

// ---------------------------------------------------------------------------
// 3. Challenge nonce generation
// ---------------------------------------------------------------------------

/** How long a wallet-connect challenge remains valid after issuance. */
export const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes — long enough to open a wallet extension and approve, short enough to bound replay risk

export interface RandomBytesSource {
  randomBytes(size: number): Uint8Array;
}

/** Production randomness source: Node's/Deno's builtin CSPRNG. */
export const productionRandomBytesSource: RandomBytesSource = {
  randomBytes(size: number) {
    return randomBytes(size);
  },
};

export interface Challenge {
  nonce: string;
  expiresAt: string; // ISO-8601
}

/**
 * Generates a one-time wallet-connect challenge nonce for a driver. `nonce`
 * is a hex-encoded SHA-256 of (driverId || random bytes) — the driver id is
 * folded in purely for domain separation (so the same random bytes would
 * never collide into the same nonce across two different drivers), not as a
 * substitute for randomness; uniqueness and replay-protection still come
 * from the random bytes plus the DB's per-driver challenge row. The random
 * source is injectable so tests are deterministic; production wiring uses
 * `productionRandomBytesSource`.
 */
export function generateChallenge(
  driverId: string,
  nowMs: number,
  randomSource: RandomBytesSource = productionRandomBytesSource
): Challenge {
  const raw = randomSource.randomBytes(32);
  const nonce = createHash("sha256").update(driverId).update(raw).digest("hex");
  const expiresAt = new Date(nowMs + CHALLENGE_TTL_MS).toISOString();
  return { nonce, expiresAt };
}

// ---------------------------------------------------------------------------
// 4. Wallet-ownership signature verification
// ---------------------------------------------------------------------------

const CHALLENGE_MESSAGE_PREFIX = "AlertGuard wallet ownership verification\nNonce: ";

/**
 * The exact message an external wallet (Leather/Xverse via sats-connect) is
 * asked to sign for a given nonce. Exported so both the server-side
 * verifier and API documentation (WALLET_INTEGRATION.md) agree on the exact
 * bytes being signed.
 */
export function buildChallengeMessage(nonce: string): string {
  return `${CHALLENGE_MESSAGE_PREFIX}${nonce}`;
}

/**
 * Verifies that `signature` proves control of `address` over the challenge
 * `nonce`, using an RSV (recoverable) ECDSA signature: the signer's public
 * key is recovered directly from the signature + message hash (no separate
 * public key input needed — sats-connect's `signMessage` produces exactly
 * this recoverable signature format), then the recovered public key is
 * hashed into an address and compared against the claimed `address`.
 *
 * Tries both compressed (the modern default used by Leather/Xverse for
 * standard single-sig addresses) and uncompressed public-key encodings, and
 * both mainnet/testnet address versions, since the caller only supplies the
 * claimed address string, not which network/encoding it was derived under.
 * Returns false (never throws) for a malformed/garbage signature or a
 * signature that recovers to a different address than the one claimed.
 *
 * Note on the try/catch scope below: `hashMessage` and `getAddressFromPublicKey`
 * cannot throw for the inputs reachable here (a plain string message, and a
 * well-formed public key that `publicKeyFromSignatureRsv` itself already
 * validated) — only `createMessageSignature` (malformed/wrong-length
 * signature hex) and `publicKeyFromSignatureRsv` (well-formed hex that
 * doesn't decode to a valid recoverable signature, e.g. a bad recovery-id
 * byte) can actually fail on attacker-controlled input, so only those two
 * calls are guarded.
 */
export function verifyWalletOwnership(address: string, nonce: string, signature: string): boolean {
  const messageHashHex = Buffer.from(hashMessage(buildChallengeMessage(nonce))).toString("hex");

  let messageSignature;
  try {
    messageSignature = createMessageSignature(signature);
  } catch {
    return false;
  }

  for (const encoding of [PubKeyEncoding.Compressed, PubKeyEncoding.Uncompressed]) {
    let recoveredPublicKey: string;
    try {
      recoveredPublicKey = publicKeyFromSignatureRsv(messageHashHex, messageSignature, encoding);
    } catch {
      continue;
    }

    for (const txVersion of [TransactionVersion.Testnet, TransactionVersion.Mainnet]) {
      const recoveredAddress = getAddressFromPublicKey(recoveredPublicKey, txVersion);
      if (recoveredAddress === address) {
        return true;
      }
    }
  }

  return false;
}
