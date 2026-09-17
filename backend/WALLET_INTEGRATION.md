# Wallet integration — client-side handoff spec

> **No driver-facing UI exists yet in this repo.** `mobile/` is a UI-free
> drowsiness-detection JVM module (no screens, no wallet code), and
> `frontend/` is the fleet-manager web dashboard only (fleet managers don't
> have wallets — drivers do). This document is the **handoff spec** for
> whoever builds the driver-facing mobile/web client next: it shows exactly
> how that future client should call the wallet Edge Functions implemented
> in this backend (`backend/supabase/functions/{generate-wallet,
> export-wallet-key, request-wallet-connect-challenge,
> connect-external-wallet}`), adapting the `sats-connect` pattern from
> [`docs/WALLET_ISSUES_AND_SOLUTIONS.md`](../docs/WALLET_ISSUES_AND_SOLUTIONS.md).
> Nothing in this file is wired into a running app today.

PRD reference: [`docs/AlertGuard-Smart-Contract-PRD.md`](../docs/AlertGuard-Smart-Contract-PRD.md)
Section 3 ("Wallet Model") and Section 10 Phase B (items 5-7).

## The four Edge Functions

All four require a `Authorization: Bearer <supabase-jwt>` header (the
driver's own session) and, since this repo's `authorizeCaller()` pattern
(`_shared/auth.ts`) also compares the JWT's user id against the `driver_id`
in the request body, the client must always pass the signed-in driver's own
id — see `backend/README.md`'s "Auth model" section.

| Function | Method | Body | Purpose |
|---|---|---|---|
| `generate-wallet` | POST | `{ driver_id }` | Creates the driver's custodial wallet (PRD Phase B item 5). Typically called once, right after signup. |
| `export-wallet-key` | POST | `{ driver_id }` | Decrypts and returns the driver's custodial private key, once (PRD Phase B item 6). |
| `request-wallet-connect-challenge` | POST | `{ driver_id }` | Issues a one-time nonce to sign with an external wallet. |
| `connect-external-wallet` | POST | `{ driver_id, address, nonce, signature }` | Verifies the signed nonce and replaces the driver's wallet address (PRD Phase B item 7). |

## Flow 1: signup — generate a custodial wallet

```ts
async function generateWallet(driverId: string, accessToken: string) {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/generate-wallet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ driver_id: driverId }),
  });
  if (!res.ok) {
    // 409 here most likely means "driver already has a wallet" (the
    // double-generation guard in _shared/wallet.ts) — treat as a no-op if
    // your signup flow can retry.
    throw new Error(`generate-wallet failed: ${res.status}`);
  }
  const { address } = await res.json();
  return address; // profiles.wallet_address is now set server-side too
}
```

## Flow 2: export the custodial private key (shown once)

```ts
async function exportWalletKey(driverId: string, accessToken: string) {
  const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/export-wallet-key`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ driver_id: driverId }),
  });
  const result = await res.json();
  if (result.status !== "exported") {
    // "wallet_not_found" | "not_custodial" (already using an external wallet)
    throw new Error(`export failed: ${result.reason}`);
  }
  return result.privateKey;
}
```

**"Shown once" is a client responsibility.** The backend logs every export
to `wallet_events` (so the driver can always see how many times their key
was exported in their own audit trail), but a stateless HTTP endpoint cannot
enforce that the *caller* only displays the value once. The client UI must:

1. Show the key in a modal with a clear "this will only be shown once, write
   it down / save it in a real wallet app now" warning.
2. Never persist it to local storage, logs, or crash-reporting breadcrumbs.
3. Clear it from memory / component state as soon as the modal is dismissed.

## Flow 3: connect an external wallet (Leather / Xverse via sats-connect)

This adapts the pattern from
[`docs/WALLET_ISSUES_AND_SOLUTIONS.md`](../docs/WALLET_ISSUES_AND_SOLUTIONS.md)
(`sats-connect`'s `wallet_connect` request + `AddressPurpose.Stacks` address
lookup) and adds the two AlertGuard-specific steps: fetching a server-issued
challenge nonce first, and signing + submitting it after the wallet connects.

```ts
import { request, AddressPurpose } from "sats-connect";

async function connectExternalWallet(driverId: string, accessToken: string) {
  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  // Step (a): get a one-time nonce from the backend. It expires after a few
  // minutes (see CHALLENGE_TTL_MS in _shared/wallet-crypto.ts) and can only
  // ever complete one connect-external-wallet call (anti-replay).
  const challengeRes = await fetch(
    `${SUPABASE_FUNCTIONS_URL}/request-wallet-connect-challenge`,
    { method: "POST", headers: authHeaders, body: JSON.stringify({ driver_id: driverId }) }
  );
  const { nonce } = await challengeRes.json();

  // Step (b): connect the wallet and read the driver's Stacks address —
  // straight out of docs/WALLET_ISSUES_AND_SOLUTIONS.md's recommended
  // pattern (wallet_connect + AddressPurpose.Stacks lookup, with the
  // -32002 "user cancelled" / "not installed" error handling that guide
  // documents in full).
  const connectResponse: any = await request("wallet_connect", {
    message: "Connect to AlertGuard to receive your safe-driving rewards",
  } as any);

  if (connectResponse?.status === "error") {
    const err: any = new Error(connectResponse.error?.message ?? "wallet connect failed");
    err.code = connectResponse.error?.code;
    throw err; // caller should special-case code === -32002 (user cancelled)
  }

  const stacksAddress = connectResponse.result.addresses.find(
    (addr: any) => addr.purpose === AddressPurpose.Stacks
  );
  if (!stacksAddress?.address) {
    throw new Error("no Stacks address returned by wallet_connect");
  }

  // Step (c): prompt the wallet to sign the nonce as a message. The EXACT
  // string signed must match buildChallengeMessage(nonce) in
  // _shared/wallet-crypto.ts:
  //   "AlertGuard wallet ownership verification\nNonce: <nonce>"
  // A different prefix/formatting will fail server-side verification even
  // with a genuinely-owned wallet, since verifyWalletOwnership() hashes this
  // exact string.
  const message = `AlertGuard wallet ownership verification\nNonce: ${nonce}`;
  const signResponse: any = await request("stx_signMessage", {
    message,
    address: stacksAddress.address,
  } as any);

  if (signResponse?.status === "error") {
    const err: any = new Error(signResponse.error?.message ?? "signing failed");
    err.code = signResponse.error?.code;
    throw err;
  }
  const signature: string = signResponse.result.signature;

  // Step (d): submit address + nonce + signature for server-side
  // verification. On success, AlertGuard replaces profiles.wallet_address
  // with this address and — if the driver had a custodial key — deletes
  // AlertGuard's copy of it (PRD Section 3 step 4c).
  const connectRes = await fetch(`${SUPABASE_FUNCTIONS_URL}/connect-external-wallet`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      driver_id: driverId,
      address: stacksAddress.address,
      nonce,
      signature,
    }),
  });
  const result = await connectRes.json();
  if (result.status !== "connected") {
    // "challenge_not_found" | "challenge_expired" | "challenge_already_consumed"
    // | "invalid_signature"
    throw new Error(`connect-external-wallet failed: ${result.reason}`);
  }
  return result; // { status: "connected", address, replacedCustodialWallet }
}
```

### Error handling

Reuse the exact error-handling table from
[`docs/WALLET_ISSUES_AND_SOLUTIONS.md`](../docs/WALLET_ISSUES_AND_SOLUTIONS.md#%EF%B8%8F-error-handling)
for the `sats-connect` half of this flow (`-32002` user-cancelled,
`WALLET_NOT_INSTALLED`, `USER_REJECTED`, `NETWORK_ERROR`). For the AlertGuard
half, `connect-external-wallet`'s JSON body's `reason` field is always one
of exactly: `challenge_not_found`, `challenge_expired`,
`challenge_already_consumed`, `invalid_signature` — map each to a
user-facing retry prompt ("that link expired, request a new one" /
"that didn't match — try again", etc.).
