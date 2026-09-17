# AlertGuard Backend

Supabase-powered backend for AlertGuard: verified drowsy-driving detection,
fleet dashboards, and reward settlement. Implements
[`docs/AlertGuard-Backend-PRD.md`](../docs/AlertGuard-Backend-PRD.md) end to
end (schema, RLS, triggers, Edge Functions), and the off-chain half of the
flow described in
[`docs/AlertGuard-Smart-Contract-PRD.md`](../docs/AlertGuard-Smart-Contract-PRD.md)
Section 6. The Clarity contracts themselves live in `../contracts` and are
out of scope here — this backend only *calls into* them via `trigger-payout`.

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

`_shared/auth.ts` is the caller-authorization gate shared by all seven
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

**Never** put `SUPABASE_SERVICE_ROLE_KEY`, `REWARD_POOL_PRIVATE_KEY`, or
`INTERNAL_FUNCTION_SECRET` in the mobile app bundle or in any file that gets
committed — they are Edge Function secrets only, read via `Deno.env.get(...)`
in each function's `index.ts`. `.env` and `.env.*.local` are gitignored.

## Auth model (PRD Section 13)

> "All Edge Functions validate the caller's JWT before acting, except
> internal function-to-function calls which use the service role and are
> never publicly invokable directly."

- **Client → Edge Function** (`verify-session`, `redeem-reward`): the caller
  must present a valid Supabase-issued JWT (`Authorization: Bearer <token>`),
  verified via `supabase.auth.getUser(token)` in the `index.ts` wiring and
  gated by `authorizeCaller()` in `_shared/auth.ts`. `redeem-reward`
  additionally checks the JWT's user id matches the `driver_id` in the
  request body, so a driver can only redeem their own balance.
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

**Result: 160 tests, all passing, across 8 spec files** (one per
`_shared/*.ts` module: `auth`, `verification`, `rewards`, `payout`,
`notifications`, `redemptions`, `reconciliation`, `fleetReports`).

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

### Coverage: what's included, what's excluded, and why

**Included in the 100% target:** everything under
`supabase/functions/_shared/*.ts` except `types.ts` (type-only, no runtime
code to cover).

**Excluded from the 100% target, with justification:**

1. **`supabase/functions/<name>/index.ts` (all 7 files).** These are the
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
