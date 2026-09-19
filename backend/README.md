# AlertGuard Backend

Supabase-powered backend for AlertGuard: verified drowsy-driving detection,
fleet dashboards, and reward settlement. Implements
[`docs/AlertGuard-Backend-PRD.md`](../docs/AlertGuard-Backend-PRD.md) end to
end (schema, RLS, triggers, Edge Functions), the off-chain half of the flow
described in
[`docs/AlertGuard-Smart-Contract-PRD.md`](../docs/AlertGuard-Smart-Contract-PRD.md)
Section 6, and that PRD's custodial wallet infrastructure (Section 3 "Wallet
Model", Section 7 "Security Model", Section 10 Phase B items 5-7 — see
"Custodial wallet infrastructure" below and
[`WALLET_INTEGRATION.md`](../backend/WALLET_INTEGRATION.md)). The Clarity
contracts themselves live in `../contracts` and are out of scope here — this
backend only *calls into* them via `trigger-payout`.

## Layout

```
backend/
├── supabase/
│   ├── config.toml                  # local dev config, auth providers, cron-callable function list
│   ├── seed.sql                     # test fleet + 2 test drivers (PRD Section 12 Step 3)
│   ├── migrations/                  # numbered, ordered SQL migrations (see below)
│   └── functions/
│       ├── _shared/                 # pure, dependency-injected TS logic — unit tested
│       └── <function-name>/index.ts # thin Deno wiring per Edge Function — NOT unit tested (see "Coverage")
├── tests/
│   ├── unit/                        # Vitest specs for every _shared module
│   └── rls/                         # pgTAP RLS test scripts (need Docker/supabase start — see tests/rls/README.md)
├── vitest.config.ts                 # coverage.thresholds = 100 on supabase/functions/_shared/**
├── package.json
├── tsconfig.json
├── WALLET_INTEGRATION.md            # client-side handoff spec for the wallet Edge Functions (no UI built yet)
└── .env.example
```

### Migrations (ordered)

| File | Contents |
|---|---|
| `20260101000001_initial_schema.sql` | Full schema: `fleets`, `profiles`, `devices`, `driving_sessions`, `drowsiness_events`, `session_verifications`, `rewards`, `redemptions`, `fleet_reports` (PRD Section 4) |
| `20260101000002_auth_trigger.sql` | `handle_new_user` trigger + `custom_access_token_hook` auth hook syncing `role`/`fleet_id` onto the JWT (PRD Section 5) |
| `20260101000003_functions_and_triggers.sql` | `update_updated_at_column`, `compute_safety_score` triggers (PRD Section 9) |
| `20260101000004_rls_policies.sql` | RLS enabled on **every** table with user data, all PRD-listed policies, plus the fleet_manager insert/update policies and hardening triggers the PRD implies but doesn't spell out (see the long comment block at the top of the file for the full rationale) |
| `20260101000005_pg_cron_jobs.sql` | Registers the reward-reconciliation (`*/5 * * * *`) and weekly fleet-reports (`0 0 * * 0`) cron jobs via `pg_cron` + `pg_net`, calling the deployed Edge Functions over HTTP |
| `20260101000006_wallet_infrastructure.sql` | `wallet_keys` (custodial private keys, envelope-encrypted, service-role-only — no client policies at all), `wallet_events` (append-only audit trail, driver-readable), `wallet_connect_challenges` (one-time connect-external-wallet nonces, service-role-only) — Smart Contract PRD Section 3 / Section 7 / Section 10 Phase B items 5-7 |
| `20260101000007_role_change_audit.sql` | `role_change_events` (append-only audit trail for `manage-user-role`, service-role-only — no client policies at all) + `find_user_id_by_email(text)`, a `SECURITY DEFINER` helper (execute revoked from `public`, granted only to `service_role`) that resolves an email to an `auth.users` id without exposing the `auth` schema to PostgREST — see "Promote user to fleet_manager/admin" below |

### Edge Functions (PRD Section 10)

| Function | Purpose | Pure-logic module |
|---|---|---|
| `verify-session` | Anti-spoofing checks, chains into `calculate-reward` | `_shared/verification.ts` |
| `calculate-reward` | Points/token formula, inserts `pending` reward, chains into `trigger-payout` | `_shared/rewards.ts` |
| `trigger-payout` | Calls the Stacks contract, settles the off-chain ledger row | `_shared/payout.ts` |
| `send-alert-notification` | SMS to fleet manager on `critical` events | `_shared/notifications.ts` |
| `redeem-reward` | Airtime / fuel voucher / insurance discount / token withdrawal | `_shared/redemptions.ts` |
| `reconcile-rewards` | Cron: re-checks `pending` rewards older than 5 minutes | `_shared/reconciliation.ts` |
| `generate-fleet-reports` | Cron: weekly `fleet_reports` aggregation | `_shared/fleetReports.ts` |
| `generate-wallet` | Signup: generates + encrypts a driver's custodial Stacks keypair | `_shared/wallet.ts`, `_shared/wallet-crypto.ts` |
| `export-wallet-key` | Decrypts and returns a driver's custodial private key (shown once, logged) | `_shared/wallet.ts`, `_shared/wallet-crypto.ts` |
| `request-wallet-connect-challenge` | Issues a one-time nonce for the "connect external wallet" flow | `_shared/wallet-crypto.ts` |
| `connect-external-wallet` | Verifies a signed challenge, replaces `profiles.wallet_address`, deletes the old custodial key | `_shared/wallet.ts`, `_shared/wallet-crypto.ts` |
| `manage-user-role` | Promotes an already-signed-up user to `fleet_manager`/`admin` from the fleet dashboard's Settings page | `_shared/roles.ts` |
| `list-promotable-users` | Lists signed-up accounts a caller may promote, for the Settings page's picker (replaces typing an email blind) | `_shared/roles.ts` |

`_shared/auth.ts` is the caller-authorization gate shared by all thirteen
(`authorizeCaller` for JWT-validated client calls, `isInternalCall` for the
shared-secret internal-only calls — see "Auth model" below).

## Setup

```bash
cd backend
npm install
cp .env.example .env   # fill in real values; .env is gitignored

# Local Supabase stack (requires Docker — see "What needs Docker" below)
supabase start
supabase db reset      # applies all migrations + seed.sql
```

Edge Function secrets (staging/production):

```bash
supabase secrets set --env-file .env
```

**Never** put `SUPABASE_SERVICE_ROLE_KEY`, `REWARD_POOL_PRIVATE_KEY`,
`INTERNAL_FUNCTION_SECRET`, or `WALLET_MASTER_ENCRYPTION_KEY` in the mobile
app bundle or in any file that gets committed — they are Edge Function
secrets only, read via `Deno.env.get(...)` in each function's `index.ts`.
`.env` and `.env.*.local` are gitignored.

## Auth model (PRD Section 13)

> "All Edge Functions validate the caller's JWT before acting, except
> internal function-to-function calls which use the service role and are
> never publicly invokable directly."

- **Client → Edge Function** (`verify-session`, `redeem-reward`, and the four
  wallet functions below): the caller must present a valid Supabase-issued
  JWT (`Authorization: Bearer <token>`), verified via
  `supabase.auth.getUser(token)` in the `index.ts` wiring and gated by
  `authorizeCaller()` in `_shared/auth.ts`. `redeem-reward` and all four
  wallet functions additionally check the JWT's user id matches the
  `driver_id` in the request body, so a driver can only act on their own
  balance/wallet. `export-wallet-key` goes one step further and disallows
  the internal-call bypass entirely (see "Custodial wallet infrastructure"
  below) — key export must always be a direct, driver-initiated request.
- **Edge Function → Edge Function** (`calculate-reward`, `trigger-payout`,
  `send-alert-notification`, `reconcile-rewards`, `generate-fleet-reports`):
  gated by `isInternalCall()`, which requires an `x-internal-secret` header
  matching the `INTERNAL_FUNCTION_SECRET` env var/Vault secret. This means
  even a leaked anon/authenticated JWT cannot invoke these "internal-only"
  functions directly — only another Edge Function (or the pg_cron jobs, which
  carry the same header) can.

## Scheduled jobs (pg_cron)

Registered in `supabase/migrations/20260101000005_pg_cron_jobs.sql`:

| Job name | Schedule | Calls |
|---|---|---|
| `reconcile-pending-rewards` | `*/5 * * * *` (every 5 min) | `POST {edge_functions_base_url}/reconcile-rewards` |
| `generate-weekly-fleet-reports` | `0 0 * * 0` (Sundays, 00:00 UTC) | `POST {edge_functions_base_url}/generate-fleet-reports` |

Both jobs use `net.http_post` (the `pg_net` extension) and pull the target
URL / service-role key / internal secret from **Supabase Vault** at run time
(`vault.decrypted_secrets`) rather than hardcoding them into the migration —
see the migration file's header comment for the exact `vault.create_secret(...)`
calls to run once against a real project before these jobs can fire
successfully.

Verifying / managing the jobs (needs a real Supabase project or
`supabase start`):

```sql
-- list registered jobs
select jobid, jobname, schedule, active from cron.job;

-- recent run history
select * from cron.job_run_details order by start_time desc limit 20;

-- disable / re-enable without deleting
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'reconcile-pending-rewards'), active := false);

-- remove entirely
select cron.unschedule('reconcile-pending-rewards');
select cron.unschedule('generate-weekly-fleet-reports');
```

This is additive on top of the `reconcile-rewards` / `generate-fleet-reports`
Edge Functions and their pure-logic modules (which are fully unit tested,
see "Testing" below) — the migration only wires the *scheduling*, so the
underlying logic is verified independently of whether pg_cron/pg_net are
actually running in a given environment.

## Deno vs. Node/Vitest decision

The task called for Supabase Edge Functions (Deno) with either Deno's test
runner or Vitest under Node, picking one and staying consistent. `deno` was
not preinstalled; `brew install deno` was attempted and **failed** (it tried
to build several dependencies — including `rust` and `llvm` — from source in
this environment and the build errored out rather than completing quickly).
Per the fallback strategy, this backend uses **Vitest under Node** for 100%
of the automated logic testing:

- Every Edge Function's business logic lives in a plain, dependency-injected
  TypeScript module under `supabase/functions/_shared/`, with **no**
  Deno-specific globals (`Deno.env.get`, `Deno.serve`, etc.) — those modules
  import and run identically under Node.
- Each Edge Function's `index.ts` is a thin Deno-only wiring layer: it reads
  `Deno.env`, constructs the Supabase client, and calls into the
  corresponding `_shared/*.ts` module. It imports `https://esm.sh/...` /
  `https://deno.land/...` URLs, which only resolve under the Deno runtime —
  these files cannot be imported or executed by Node/Vitest at all.

## Testing

```bash
npm test          # vitest run
npm run coverage  # vitest run --coverage
```

**Result: 229 tests, all passing, across 11 spec files** (one per
`_shared/*.ts` module: `auth`, `verification`, `rewards`, `payout`,
`notifications`, `redemptions`, `reconciliation`, `fleetReports`,
`wallet-crypto`, `wallet`, `roles`).

**Coverage: 100% lines / 100% branches / 100% functions / 100% statements**
on every file under `supabase/functions/_shared/` (excluding `types.ts`,
which has no executable code — just type declarations). `vitest.config.ts`
sets `coverage.all = true` and `coverage.thresholds = { lines: 100, branches:
100, functions: 100, statements: 100 }`, so `npm run coverage` **fails the
run** if coverage regresses below 100% on this layer — this was iterated on
until green (see "Coverage: what's included").

```
 % Coverage report from v8
-------------------|---------|----------|---------|---------|
File               | % Stmts | % Branch | % Funcs | % Lines |
-------------------|---------|----------|---------|---------|
All files          |     100 |      100 |     100 |     100 |
 auth.ts           |     100 |      100 |     100 |     100 |
 fleetReports.ts   |     100 |      100 |     100 |     100 |
 notifications.ts  |     100 |      100 |     100 |     100 |
 payout.ts         |     100 |      100 |     100 |     100 |
 reconciliation.ts |     100 |      100 |     100 |     100 |
 redemptions.ts    |     100 |      100 |     100 |     100 |
 rewards.ts        |     100 |      100 |     100 |     100 |
 verification.ts   |     100 |      100 |     100 |     100 |
 wallet-crypto.ts  |     100 |      100 |     100 |     100 |
 wallet.ts         |     100 |      100 |     100 |     100 |
 roles.ts          |     100 |      100 |     100 |     100 |
-------------------|---------|----------|---------|---------|
```

### What each spec covers

- **`verification.test.ts`** (56 tests) — every branch of
  `checkGpsContinuity` (missing/invalid coordinates, negative/missing
  distance, unparseable/inverted timestamps, distance-vs-straight-line
  mismatches in both directions, implausible speed above/at/below the
  threshold boundary, zero-straight-line round trips), `checkDeviceAttestation`
  (missing device, missing/empty/whitespace/short/non-hex key, valid key),
  `checkTimestampConsistency` (missing/unparseable timestamps, inverted
  order, future timestamps with/without clock-skew tolerance, max-duration
  boundary, moving-vs-stationary duration guard), and `verifySession`'s
  combination logic.
- **`rewards.test.ts`** (19 tests) — the PRD formula
  (`points = round(safety_score * distance_km/10)`, `tokenAmount = points *
  rate`), plus the zero/negative guards for score, distance, and rate, and
  the `processRewardCalculation` orchestration (insert + chain into payout,
  missing-driver-id error path).
- **`payout.test.ts`** (9 tests) — success path (mocked Stacks client:
  `settled` + tx hash persisted), missing-wallet / non-positive-amount
  failure paths (no network call made), thrown-`Error` and thrown-non-`Error`
  failure paths, and `createStacksPayoutClient`'s contract-call/broadcast
  wiring including the broadcast-error branch.
- **`notifications.test.ts`** (19 tests) — message building (name/fleet
  present/absent), `sendAlertNotification`'s branches (not-critical, no
  manager phone, provider success/failure/throw), and both `SmsProvider`
  implementations (Termii default + custom base URL + non-ok response;
  Africa's Talking same, plus a missing-recipient-id edge case).
- **`redemptions.test.ts`** (13 tests) — every `redemption_type` branch
  (`airtime`, `token_withdrawal`, `fuel_voucher`, `insurance_discount`) with
  success and failure sub-cases, the zero/negative-amount guard (rejected
  before any row is written), and the unsupported-type exhaustiveness guard.
- **`reconciliation.test.ts`** (13 tests) — not-pending skip, not-stale skip
  (and the exact-threshold boundary), on-chain success/failed/still-pending
  branches, no-tx-hash retry success/failure, and thrown-Error/non-Error
  flagging branches.
- **`fleetReports.test.ts`** (12 tests) — `getPreviousWeekPeriod` across a
  mid-week, a Monday, a Sunday, and a month-boundary reference date;
  `computeFleetAggregate`'s scored/unscored/empty/negative-count/rounding
  cases; and `generateFleetReports`'s multi-fleet orchestration.
- **`auth.test.ts`** (19 tests) — bearer-token extraction, the internal
  shared-secret check, and `authorizeCaller`'s internal/missing/invalid/valid
  branches.
- **`wallet-crypto.test.ts`** (26 tests) — AES-256-GCM `encryptPrivateKey`/
  `decryptPrivateKey` round-trip, random-IV non-determinism, master-key
  length guards, malformed-payload/tampered-ciphertext/tampered-authTag/
  wrong-key decrypt failures (proving this is authenticated encryption, not
  obfuscation); `parseMasterKey`'s hex/base64/invalid branches;
  `generateStacksKeypair`'s injected-source determinism, mainnet/testnet
  network selection, wrong-byte-length guard, and real production source;
  `generateChallenge`'s nonce/expiry shape, per-driver domain separation, and
  real production randomness; and `verifyWalletOwnership` tested against
  **real** `@stacks/transactions`/`@stacks/encryption` keypairs and
  signatures — a real signature verifies, a tampered nonce fails, a
  signature from a different keypair fails, and malformed/invalid-recovery-
  bit signatures fail without throwing.
- **`wallet.test.ts`** (14 tests) — `generateAndStoreWallet`'s success path
  and its double-generation guard (throws, writes nothing); `exportWalletKey`'s
  success path plus `wallet_not_found`/`not_custodial` branches;
  `connectExternalWallet`'s success path (with and without deleting an
  existing custodial key, and the no-op-delete case for re-linking a
  different external wallet) plus every documented failure branch
  (`challenge_not_found`, `challenge_already_consumed`, `challenge_expired`,
  `invalid_signature`), and the default-to-the-real-verifier wiring.
- **`roles.test.ts`** (21 tests) — every branch of `authorizeRoleChange`
  (driver/no-profile caller forbidden; fleet_manager caller can only grant
  fleet_manager, with the caller's own `fleet_id` always forced regardless of
  what was requested; fleet_manager requesting admin forbidden; admin caller
  granting fleet_manager with/without/blank `fleet_id` — `fleet_id_required`;
  admin caller granting admin with a `fleet_id`, with `null`, and with none at
  all), and `manageUserRole`'s orchestration (success paths for both caller
  roles, the `cannot_modify_own_role` self-promotion guard — proven to run
  before the caller-profile lookup, the authorization check, and any write —
  `user_not_found`, `forbidden` for a driver/no-profile caller, and
  `profile_not_ready` for a target with no `profiles` row).

### Coverage: what's included, what's excluded, and why

**Included in the 100% target:** everything under
`supabase/functions/_shared/*.ts` except `types.ts` (type-only, no runtime
code to cover).

**Excluded from the 100% target, with justification:**

1. **`supabase/functions/<name>/index.ts` (all 12 files).** These are the
   Deno-only wiring layer: `serve()`, `Deno.env.get(...)`, the real
   `@supabase/supabase-js` and `@stacks/transactions` imports via
   `https://esm.sh/...` URLs. They cannot be imported or executed by
   Node/Vitest — attempting to `import` one fails immediately on the remote
   URL specifier. `vitest.config.ts`'s `coverage.include` only globs
   `supabase/functions/_shared/**/*.ts`, so these files are never even
   instrumented, by design, rather than instrumented-and-failing. This is the
   direct consequence of the "thin wiring, real logic tested separately"
   split the task specified.
2. **`tests/rls/*.sql` (pgTAP RLS tests).** These assert RLS policy behavior
   directly against Postgres and require a running Supabase/Postgres
   instance with the `pgtap` extension (`supabase start`, which needs
   Docker). Docker was not available in this environment, so these scripts
   are written and documented (see `tests/rls/README.md`) but not executed
   here. They are SQL, not TypeScript, so they were never part of the
   Vitest/v8 coverage number in the first place — called out here explicitly
   per the task's request.
3. **`supabase/migrations/*.sql`.** Schema/RLS/trigger/cron SQL, verified by
   manual review and (for RLS) the pgTAP scripts above — not something a
   line/branch coverage tool measures.

## RLS testing (`tests/rls/`)

Four pgTAP scripts assert the isolation rules from PRD Section 6 and the
adversarial-test callouts in Section 12:

- `01_driver_isolation.sql` — a driver sees/writes only their own sessions,
  events, and rewards; cannot read, update, or insert against another
  driver's session (the Section 12 Step 4 adversarial test).
- `02_fleet_manager_isolation.sql` — a fleet manager sees only their own
  fleet's drivers/sessions/reports, can flag their own fleet's session, and
  cannot touch another fleet's.
- `03_admin_service_role.sql` — statically asserts no RLS policy
  special-cases `role = 'admin'`, that a `profiles.role='admin'` user gets no
  extra visibility through RLS, and that `service_role` has `BYPASSRLS` —
  i.e. admin access is via the service-role key in Edge Functions only, per
  the PRD's explicit design choice.
- `04_privilege_escalation.sql` — a driver cannot self-set their session to
  `verified`, cannot self-promote their own `role`/`fleet_id`, cannot insert
  events against a non-active session, but *can* update their own
  non-privileged profile fields — and the `service_role` path can do all of
  the above (proving the guard triggers are role-scoped, not absolute).

**These require Docker** (`supabase start` needs it) and were not executed in
this environment — see `tests/rls/README.md` for exact run instructions once
Docker is available. They do not count toward the 100% coverage figure
above.

## Custodial wallet infrastructure (Smart Contract PRD Section 3 / Section 7 / Section 10 Phase B)

Implements Phase B items 5-7 of the Smart Contract PRD's step-by-step plan:
keypair generation on signup, a one-time-viewable export flow, and
"connect external wallet". See
[`WALLET_INTEGRATION.md`](../backend/WALLET_INTEGRATION.md) for the
client-side (`sats-connect`) half of the connect flow — **no driver-facing
UI exists yet in this repo**, that document is a handoff spec.

- **Data model** (`supabase/migrations/20260101000006_wallet_infrastructure.sql`):
  `wallet_keys` (one custodial key per driver, envelope-encrypted, RLS
  enabled with **zero** client-facing policies — service-role only, same
  deny-by-omission pattern as `rewards`/`redemptions`), `wallet_events`
  (append-only audit trail, driver-readable via a `select`-own policy, never
  client-writable), and `wallet_connect_challenges` (one-time nonces,
  service-role only).
- **Encryption**: AES-256-GCM via Node's/Deno's built-in `node:crypto`
  (`_shared/wallet-crypto.ts`) — authenticated encryption, no extra
  dependency. The master key is injected (never imported/hardcoded), read in
  production from the `WALLET_MASTER_ENCRYPTION_KEY` Edge Function secret
  (see `.env.example`); `wallet_keys.encryption_key_id` records which
  key/version encrypted a given row, for future rotation.
- **Stacks keypair generation**: `_shared/wallet-crypto.ts`'s
  `generateStacksKeypair` builds a **compressed**-format private key (the
  format Leather/Xverse use for standard single-sig addresses — the
  underlying `@stacks/transactions` library's own default is uncompressed,
  which would produce a non-standard address), behind an injectable
  `StacksKeypairSource` so tests use deterministic bytes.
- **Wallet-ownership verification**: `verifyWalletOwnership` uses an RSV
  (recoverable) ECDSA signature to recover the signer's public key directly
  from the signature + challenge-message hash — no separate public-key input
  needed, matching the exact 3-argument shape (`address, nonce, signature`)
  the task specified, and matching what a `sats-connect` `stx_signMessage`
  call returns. Tested against **real** keypairs/signatures generated with
  the same `@stacks/transactions`/`@stacks/encryption` libraries, not mocks.
- **`@stacks/transactions` / `@stacks/encryption` as real `dependencies`**
  (not just Deno `esm.sh` imports like `payout.ts`'s Stacks calls): signature
  verification and key generation are pure, deterministic, **offline**
  operations — no network I/O — so unlike `payout.ts`'s network-bound
  Stacks calls, there's no testability reason to inject them behind a fake.
  This is a deliberate, documented departure from every other `_shared`
  module's zero-external-import style; see the header comment in
  `_shared/wallet-crypto.ts` for the full rationale, including the caveat
  that a real Deno deployment of this bare npm specifier needs a
  `deno.json` import-map entry (Deno itself was not available in this
  environment to verify end-to-end).
- **Export is "shown once" only as a UX convention, not a server-enforced
  guarantee.** `exportWalletKey` decrypts, logs an `exported` audit event,
  and returns the key — a stateless HTTP endpoint cannot itself prevent a
  client from calling it twice or persisting the response. `export-wallet-key`
  is also the one wallet function with **no internal-call bypass** at all
  (see its `index.ts`): every export must be a direct, driver-authenticated
  request.
- **Connect-external-wallet only deletes a *custodial* key.** If a driver is
  re-linking a *different* external wallet (their existing `wallet_keys` row
  is already `wallet_type = 'external'`), `connectExternalWallet` correctly
  does nothing to `wallet_keys` — there is no AlertGuard-held key to delete
  for them.
- **`generateAndStoreWallet` throws on double-generation** rather than
  silently minting a second keypair or returning the existing one — a silent
  second generation would overwrite `profiles.wallet_address` out from under
  any balance already tied to the first address, with no "list past wallets"
  endpoint to recover from it. `wallet_keys.driver_id` is also `UNIQUE` at
  the DB layer as a second line of defense.

## Promote user to fleet_manager/admin (`manage-user-role`)

Replaces "hand-run SQL in the Supabase SQL Editor" with a real in-app
feature: an admin or fleet_manager on the fleet dashboard's Settings page
types an already-signed-up user's email and promotes them to `fleet_manager`
or `admin`. Always an end-user-initiated request (the caller's own JWT) —
there is no internal-call/shared-secret path for this function.

- **Pure logic**: `_shared/roles.ts` — `authorizeRoleChange` (the
  caller-role x requested-role x fleet_id decision, no DB access) and
  `manageUserRole` (the DB-touching orchestration, DI'd against injectable
  repo interfaces, same shape as `_shared/wallet.ts`). Wiring:
  `supabase/functions/manage-user-role/index.ts`.
- **Authorization rules** (`authorizeRoleChange`):
  - Caller role `driver`, or no `profiles` row at all -> `forbidden`.
  - Caller role `fleet_manager` -> may only grant `fleet_manager`, and the
    target's `fleet_id` is **always forced to the caller's own `fleet_id`**
    — whatever `fleet_id` was in the request is ignored/overwritten, so a
    fleet_manager can never assign a driver into a fleet other than their
    own. Requesting `admin` -> `forbidden`.
  - Caller role `admin` -> may grant `fleet_manager` (a `fleet_id` is
    **required** in the request — `fleet_id_required` if missing/blank — an
    admin promoting someone to fleet_manager must say which fleet) or
    `admin` (`fleet_id` is optional, passed through exactly as given,
    including `null`).
- **Self-promotion guard — read this if you touch this code.**
  `guard_profile_self_escalation`
  (`supabase/migrations/20260101000004_rls_policies.sql`, ~line 134) blocks a
  user from changing their own `role`/`fleet_id` **only when
  `auth.role() <> 'service_role'`** — and `manage-user-role` runs under the
  service-role key, so the DB trigger does **not** protect this endpoint.
  `manageUserRole` in `_shared/roles.ts` is the only thing that does: it
  resolves the target email to a user id first, and if that id equals the
  caller's own `userId`, it rejects unconditionally with
  `cannot_modify_own_role` — **before** the caller-profile lookup, the
  `authorizeRoleChange` decision, or any write. This holds regardless of the
  caller's current role (an admin cannot use this endpoint on their own row
  either). See `roles.test.ts`'s
  `"rejects with cannot_modify_own_role, unconditionally, before any
  role-authorization logic runs, when the target email is the caller's own
  account"` test, which also asserts none of the downstream repo methods
  were even called.
- **Email -> user id lookup**: `auth.users` isn't exposed via PostgREST and
  has no `profiles`-style RLS policies to lean on, so
  `find_user_id_by_email(text)` (`20260101000007_role_change_audit.sql`) is a
  `SECURITY DEFINER` SQL function reading it directly (same technique as
  `current_role()`/`current_fleet_id()` in `20260101000004_rls_policies.sql`)
  — with `EXECUTE` explicitly revoked from `PUBLIC` and granted only to
  `service_role`, so an anon/authenticated caller can never use it as an
  email-enumeration oracle via the RPC endpoint. In `_shared/roles.ts` this
  is behind the injectable `TargetUserResolver` interface, so the pure
  orchestration logic is tested with a fake, never a real network call.
- **`user_not_found` is an expected, common outcome, not an error.** The
  target hasn't necessarily signed in yet — `manage-user-role` returns a
  distinct `user_not_found` reason (mapped to HTTP 404) rather than a generic
  500, so the frontend can show a clear "this person needs to sign in to
  AlertGuard at least once first" message. A target that exists in
  `auth.users` but somehow has no `profiles` row yet (shouldn't happen given
  `handle_new_user`, but not assumed) returns `profile_not_ready` instead of
  crashing.
- **Audit trail**: every successful role change writes a
  `role_change_events` row (`20260101000007_role_change_audit.sql` —
  `actor_id`, `target_id`, `old_role`/`new_role`, `old_fleet_id`/
  `new_fleet_id`) — RLS enabled, zero client policies, same
  service-role-only deny-by-omission pattern as `wallet_keys`/
  `wallet_connect_challenges`.
- **HTTP status mapping** (`manage-user-role/index.ts`): 200 success; 403
  `forbidden`/`cannot_modify_own_role`; 404 `user_not_found`/
  `profile_not_ready`; 400 `invalid_request`/`fleet_id_required`.

## List signed-up accounts to promote (`list-promotable-users`)

Powers the Settings page's user picker: browse signed-up accounts instead of
typing an email blind into `manage-user-role`. Same
end-user-initiated-only shape as `manage-user-role` (caller's own JWT, no
internal-call path).

- **Pure logic**: `_shared/roles.ts` — `selectPromotableUsers` (pure scoping
  decision: which of "every signed-up user" the caller may see, no DB access)
  and `listPromotableUsers` (resolves the caller's own role, then applies the
  scoping). Wiring: `supabase/functions/list-promotable-users/index.ts`.
- **Scoping rules** (`selectPromotableUsers`), mirroring
  `authorizeRoleChange`'s grant rules and
  `fleet_managers_assign_driver_to_fleet`'s RLS policy so nobody is ever shown
  a candidate they couldn't actually promote:
  - Caller role `driver`, or no `profiles` row at all -> sees nobody
    (`forbidden`).
  - Caller role `admin` -> every other signed-up user, any role, any fleet.
  - Caller role `fleet_manager` -> only `driver` rows that are unassigned
    (`fleet_id is null`) or already in the caller's own fleet.
  - The caller's own row is always excluded — this is a browse list, not a
    self-service role changer (`manage-user-role` separately, unconditionally
    rejects self-promotion regardless of what this endpoint shows).
- **Where emails come from**: `profiles` has no `email` column — email only
  lives in `auth.users`, which isn't exposed via PostgREST. Rather than add
  another `SECURITY DEFINER` SQL function, `index.ts` uses the service-role
  Admin API (`supabase.auth.admin.listUsers`) to fetch every user's email and
  joins it with `profiles` by id in memory. Single page, `perPage: 1000` — no
  pagination yet; revisit if a fleet's signed-up-user count ever approaches
  that.

## Design decisions worth knowing about

- **`checkGpsContinuity` design.** The PRD names the function
  ("no teleporting, plausible speed") but the schema only stores
  session-level start/end coordinates plus a client-side GPS-trace *hash*
  (full trace is deliberately not stored server-side per PRD Section 13). So
  the check validates that the reported `distance_km` is geometrically
  consistent with the straight-line distance between the reported
  start/end points (can't be much shorter than crow-flies, can't be an
  absurd multiple of it), and that the implied average speed is a plausible
  road-vehicle speed (default cap 180 km/h, configurable). See the long
  comment block at the top of `_shared/verification.ts`.
- **SMS provider choice is provisional.** PRD Section 14 leaves Termii vs.
  Africa's Talking as an open cost-comparison question. This backend
  defaults to **Termii** (`_shared/notifications.ts`), documented as
  provisional and switchable via the `SMS_PROVIDER` env var — both providers
  are implemented behind the same `SmsProvider` interface.
- **RLS hardening beyond the PRD's snippet.** RLS is enabled on all 9 tables
  (not just the 4 shown in Section 6), two `SECURITY DEFINER` helper
  functions avoid self-referential-policy recursion on `profiles`, a
  `guard_session_status_transition` trigger stops a driver from self-setting
  `status = 'verified'` (RLS `USING`/`WITH CHECK` alone can't compare OLD vs
  NEW), a `guard_profile_self_escalation` trigger stops self-role-promotion,
  and fleet managers get scoped INSERT/UPDATE policies (own fleet, flagging
  a session, assigning an unassigned driver) that the PRD implies but
  doesn't spell out. Full rationale is in the comment header of
  `supabase/migrations/20260101000004_rls_policies.sql`.
- **`rewards`/`redemptions` have no client INSERT/UPDATE policies at all**,
  not even for fleet managers — these are financial ledgers written
  exclusively by Edge Functions under the service role, to preserve the
  Smart Contract PRD's "on-chain and off-chain state must never silently
  diverge" invariant.
- **`token_withdrawal` redemption is wired but stubbed at the production
  layer** (`redeem-reward/index.ts` throws with a message pointing at Smart
  Contract PRD Section 8/12) pending the sponsored-transaction vs.
  pre-funded-STX-float decision — the pure logic (`_shared/redemptions.ts`)
  fully supports and tests the success/failure paths against an injectable
  `StacksTransferProvider`, so wiring in a real implementation later is a
  one-function change.
- **Termii/Africa's Talking are not in Supabase Auth's built-in phone-OTP
  provider list** (Twilio/Twilio Verify/MessageBird/TextLocal/Vonage are).
  `supabase/config.toml`'s `[auth.sms]` section documents this gap: shipping
  phone-OTP via Termii in production needs either a supported provider as
  the literal OTP channel, or a custom "Send SMS" Auth Hook — left as a
  production decision, not resolved here.
