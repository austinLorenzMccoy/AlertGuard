import { describe, it, expect } from "vitest";
import {
  encryptPrivateKey,
  decryptPrivateKey,
  parseMasterKey,
  generateStacksKeypair,
  generateChallenge,
  CHALLENGE_TTL_MS,
  buildChallengeMessage,
  verifyWalletOwnership,
  type StacksKeypairSource,
  type RandomBytesSource,
} from "../../supabase/functions/_shared/wallet-crypto.ts";
import {
  createStacksPrivateKey,
  getAddressFromPrivateKey,
  signMessageHashRsv,
  createMessageSignature,
  TransactionVersion,
  type StacksPrivateKey,
} from "@stacks/transactions";
import { hashMessage } from "@stacks/encryption";

function makeMasterKey(byte = 7): Buffer {
  return Buffer.alloc(32, byte);
}

/** A real, deterministic 33-byte compressed-key hex — deterministic only for test reproducibility, not a security property. */
function fixedCompressedPrivKeyHex(seedByte: number): string {
  return Buffer.alloc(32, seedByte).toString("hex") + "01";
}

/** Signs the real AlertGuard challenge message for `nonce` with a real StacksPrivateKey, using the real @stacks/transactions signing routine. */
function signChallenge(privateKey: StacksPrivateKey, nonce: string): string {
  const messageHashHex = Buffer.from(hashMessage(buildChallengeMessage(nonce))).toString("hex");
  return signMessageHashRsv({ messageHash: messageHashHex, privateKey }).data;
}

describe("encryptPrivateKey / decryptPrivateKey", () => {
  it("round-trips plaintext through encrypt then decrypt", () => {
    const masterKey = makeMasterKey();
    const { encryptedPrivateKey, encryptionKeyId } = encryptPrivateKey(
      "super-secret-stacks-private-key",
      masterKey,
      "key-v1"
    );
    expect(encryptionKeyId).toBe("key-v1");
    expect(decryptPrivateKey(encryptedPrivateKey, masterKey)).toBe("super-secret-stacks-private-key");
  });

  it("produces a different ciphertext each call, even for the same plaintext (random IV)", () => {
    const masterKey = makeMasterKey();
    const a = encryptPrivateKey("same-plaintext", masterKey, "k1");
    const b = encryptPrivateKey("same-plaintext", masterKey, "k1");
    expect(a.encryptedPrivateKey).not.toBe(b.encryptedPrivateKey);
    expect(decryptPrivateKey(a.encryptedPrivateKey, masterKey)).toBe("same-plaintext");
    expect(decryptPrivateKey(b.encryptedPrivateKey, masterKey)).toBe("same-plaintext");
  });

  it("throws when the master key is not 32 bytes (encrypt)", () => {
    expect(() => encryptPrivateKey("x", Buffer.alloc(16), "k1")).toThrow(RangeError);
  });

  it("throws when the master key is not 32 bytes (decrypt)", () => {
    const { encryptedPrivateKey } = encryptPrivateKey("x", makeMasterKey(), "k1");
    expect(() => decryptPrivateKey(encryptedPrivateKey, Buffer.alloc(10))).toThrow(RangeError);
  });

  it("throws on a malformed payload (wrong number of ':'-delimited segments)", () => {
    expect(() => decryptPrivateKey("not-enough-parts", makeMasterKey())).toThrow(/malformed/);
  });

  it("throws — proving authenticated encryption, not mere obfuscation — when the ciphertext is tampered with", () => {
    const masterKey = makeMasterKey();
    const { encryptedPrivateKey } = encryptPrivateKey("secret-key-material", masterKey, "k1");
    const [iv, authTag, ciphertext] = encryptedPrivateKey.split(":");
    const tamperedCiphertext = Buffer.from(ciphertext, "base64");
    tamperedCiphertext[0] ^= 0xff;
    const tampered = [iv, authTag, tamperedCiphertext.toString("base64")].join(":");
    expect(() => decryptPrivateKey(tampered, masterKey)).toThrow();
  });

  it("throws when the authTag is tampered with", () => {
    const masterKey = makeMasterKey();
    const { encryptedPrivateKey } = encryptPrivateKey("secret-key-material", masterKey, "k1");
    const [iv, authTag, ciphertext] = encryptedPrivateKey.split(":");
    const tamperedTag = Buffer.from(authTag, "base64");
    tamperedTag[0] ^= 0xff;
    const tampered = [iv, tamperedTag.toString("base64"), ciphertext].join(":");
    expect(() => decryptPrivateKey(tampered, masterKey)).toThrow();
  });

  it("throws when decrypted with the wrong master key", () => {
    const { encryptedPrivateKey } = encryptPrivateKey("secret-key-material", makeMasterKey(1), "k1");
    expect(() => decryptPrivateKey(encryptedPrivateKey, makeMasterKey(2))).toThrow();
  });
});

describe("parseMasterKey", () => {
  it("parses a valid 64-char hex key", () => {
    const hex = "ab".repeat(32);
    const buf = parseMasterKey(hex);
    expect(buf.length).toBe(32);
    expect(buf.toString("hex")).toBe(hex);
  });

  it("parses a valid base64-encoded 32-byte key", () => {
    const original = Buffer.alloc(32, 5);
    const buf = parseMasterKey(original.toString("base64"));
    expect(buf.equals(original)).toBe(true);
  });

  it("throws when the value decodes to something other than 32 bytes", () => {
    expect(() => parseMasterKey("too-short")).toThrow(/32-byte/);
  });
});

describe("generateStacksKeypair", () => {
  function fixedSource(seedByte: number): StacksKeypairSource {
    return { randomPrivateKeyBytes: () => Buffer.alloc(32, seedByte) };
  }

  it("derives a deterministic compressed private key and testnet address from injected bytes", () => {
    const keypair = generateStacksKeypair(fixedSource(1), "testnet");
    expect(keypair.privateKey).toBe(fixedCompressedPrivKeyHex(1));
    expect(keypair.address.startsWith("ST")).toBe(true);
  });

  it("derives a mainnet address when network is 'mainnet'", () => {
    const keypair = generateStacksKeypair(fixedSource(2), "mainnet");
    expect(keypair.address.startsWith("SP")).toBe(true);
  });

  it("defaults to testnet when network is omitted", () => {
    const keypair = generateStacksKeypair(fixedSource(3));
    expect(keypair.address.startsWith("ST")).toBe(true);
  });

  it("throws when the injected source returns the wrong byte length", () => {
    const badSource: StacksKeypairSource = { randomPrivateKeyBytes: () => Buffer.alloc(10) };
    expect(() => generateStacksKeypair(badSource)).toThrow(RangeError);
  });

  it("uses the real production keypair source by default", () => {
    const keypair = generateStacksKeypair();
    expect(keypair.privateKey).toMatch(/^[0-9a-f]{66}$/);
    expect(keypair.address.startsWith("ST")).toBe(true);
    // A second call must not repeat the same random key.
    const keypair2 = generateStacksKeypair();
    expect(keypair2.privateKey).not.toBe(keypair.privateKey);
  });
});

describe("generateChallenge", () => {
  function fixedRandom(byte: number): RandomBytesSource {
    return { randomBytes: (size: number) => Buffer.alloc(size, byte) };
  }

  it("returns a hex nonce and an expiresAt exactly CHALLENGE_TTL_MS in the future", () => {
    const nowMs = 1_700_000_000_000;
    const challenge = generateChallenge("driver-1", nowMs, fixedRandom(1));
    expect(challenge.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(challenge.expiresAt).toBe(new Date(nowMs + CHALLENGE_TTL_MS).toISOString());
  });

  it("produces different nonces for different drivers given identical random bytes (domain separation)", () => {
    const nowMs = 1_700_000_000_000;
    const a = generateChallenge("driver-a", nowMs, fixedRandom(9));
    const b = generateChallenge("driver-b", nowMs, fixedRandom(9));
    expect(a.nonce).not.toBe(b.nonce);
  });

  it("uses the real production random source by default", () => {
    const challenge = generateChallenge("driver-x", Date.now());
    expect(challenge.nonce).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildChallengeMessage", () => {
  it("embeds the exact nonce in the signed message", () => {
    expect(buildChallengeMessage("abc123")).toContain("abc123");
  });
});

describe("verifyWalletOwnership", () => {
  it("verifies a real signature, from a real keypair, over the real challenge message (testnet address)", () => {
    const privHex = fixedCompressedPrivKeyHex(11);
    const priv = createStacksPrivateKey(privHex);
    const address = getAddressFromPrivateKey(privHex, TransactionVersion.Testnet);
    const nonce = "test-nonce-abc";
    const signature = signChallenge(priv, nonce);

    expect(verifyWalletOwnership(address, nonce, signature)).toBe(true);
  });

  it("verifies a real signature against a mainnet address", () => {
    const privHex = fixedCompressedPrivKeyHex(12);
    const priv = createStacksPrivateKey(privHex);
    const address = getAddressFromPrivateKey(privHex, TransactionVersion.Mainnet);
    const nonce = "mainnet-nonce";
    const signature = signChallenge(priv, nonce);

    expect(verifyWalletOwnership(address, nonce, signature)).toBe(true);
  });

  it("rejects a real signature when the nonce was tampered with after signing", () => {
    const privHex = fixedCompressedPrivKeyHex(13);
    const priv = createStacksPrivateKey(privHex);
    const address = getAddressFromPrivateKey(privHex, TransactionVersion.Testnet);
    const signature = signChallenge(priv, "original-nonce");

    expect(verifyWalletOwnership(address, "a-different-nonce", signature)).toBe(false);
  });

  it("rejects a real, validly-formed signature that recovers to a different address than claimed", () => {
    const privHexA = fixedCompressedPrivKeyHex(14);
    const privA = createStacksPrivateKey(privHexA);
    const nonce = "cross-key-nonce";
    const signature = signChallenge(privA, nonce);

    const privHexB = fixedCompressedPrivKeyHex(15);
    const addressB = getAddressFromPrivateKey(privHexB, TransactionVersion.Testnet);

    expect(verifyWalletOwnership(addressB, nonce, signature)).toBe(false);
  });

  it("rejects a malformed/garbage signature without throwing", () => {
    expect(() =>
      verifyWalletOwnership("ST1SOMEADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXX", "some-nonce", "not-a-real-signature")
    ).not.toThrow();
    expect(verifyWalletOwnership("ST1SOMEADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXX", "some-nonce", "not-a-real-signature")).toBe(
      false
    );
  });

  it("rejects a well-formed-length signature with an invalid recovery bit, for both pubkey encodings", () => {
    // Sanity check this really is parseable-but-unrecoverable, exercising the
    // publicKeyFromSignatureRsv catch/continue branch rather than the
    // createMessageSignature catch branch above.
    expect(() => createMessageSignature("aa".repeat(65))).not.toThrow();

    const fakeSignature = "aa".repeat(65);
    expect(verifyWalletOwnership("ST1SOMEADDRESSXXXXXXXXXXXXXXXXXXXXXXXXXX", "some-nonce", fakeSignature)).toBe(
      false
    );
  });
});
