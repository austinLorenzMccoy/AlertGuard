<div align="center">

# 🚨 AlertGuard

**Verified-safe-driving detection, with an on-chain incentive layer.**

On-device fatigue detection for the phone a driver already owns — verified, not self-reported — turning safe driving into a redeemable reward funded by real fleet and insurer revenue, not token emissions.

[![Contracts](https://img.shields.io/badge/contracts-100%25%20coverage-brightgreen?style=flat-square&logo=stacks&logoColor=white)](./contracts)
[![Backend](https://img.shields.io/badge/backend-100%25%20coverage-brightgreen?style=flat-square&logo=supabase&logoColor=white)](./backend)
[![Frontend](https://img.shields.io/badge/frontend-100%25%20coverage-brightgreen?style=flat-square&logo=next.js&logoColor=white)](./frontend)
[![Mobile](https://img.shields.io/badge/mobile-100%25%20coverage-brightgreen?style=flat-square&logo=kotlin&logoColor=white)](./mobile)
[![AI/ML](https://img.shields.io/badge/ai%2Fml-100%25%20coverage-brightgreen?style=flat-square&logo=python&logoColor=white)](./ai-ml)

[![Tests](https://img.shields.io/badge/tests-629%20passing-brightgreen?style=flat-square)](#test-summary)
[![Clarity](https://img.shields.io/badge/Clarity-Stacks-5546FF?style=flat-square)](./contracts)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Edge%20Functions-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](./backend)
[![Next.js](https://img.shields.io/badge/Next.js-14%20App%20Router-000000?style=flat-square&logo=next.js&logoColor=white)](./frontend)
[![Kotlin](https://img.shields.io/badge/Kotlin-JVM%20module-7F52FF?style=flat-square&logo=kotlin&logoColor=white)](./mobile)
[![Python](https://img.shields.io/badge/Python-3.12-3776AB?style=flat-square&logo=python&logoColor=white)](./ai-ml)
[![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey?style=flat-square)](#license)

</div>

---

## What this is

AlertGuard detects driver drowsiness on-device (eye closure, yawning, head-nod drift) using a rolling-window, threshold-based state machine — no raw video ever leaves the phone. A verified safe session (GPS continuity + device attestation + timestamp consistency, checked server-side) unlocks a reward, settled on the Stacks blockchain via a capped, replay-safe smart contract. Fleet operators and insurers get a real-time dashboard of driver safety instead of self-reported claims.

Full product context, architecture rationale, and phased rollout plan live in [`docs/`](./docs) (git-ignored — internal specs, not shipped).

## Repository layout

This is a five-workstream monorepo, each an independently buildable/testable project matching a PRD in `docs/`:

```
Alertguard/
├── contracts/    Clarity smart contracts (Stacks) — reward token + settlement
├── backend/      Supabase: Postgres schema, RLS, triggers, Edge Functions, pg_cron
├── frontend/     Next.js 14 web fleet dashboard
├── mobile/       Standalone Kotlin/JVM drowsiness-detection engine
├── ai-ml/        Python feature-extraction + state-machine + evaluation prototype
└── docs/         Product/technical PRDs (git-ignored)
```

Each folder is self-contained: its own dependency manifest, test suite, coverage config, and `README.md` with setup instructions and design rationale.

## Test summary

| Module | Stack | Tests | Coverage | Notes |
|---|---|---:|---:|---|
| [`contracts/`](./contracts) | Clarity + Clarinet/vitest | 32 | **100%** line & branch | SIP-010 `GUARD` token + capped, replay-safe `reward-settlement` contract |
| [`backend/`](./backend) | Supabase (Postgres, Deno Edge Functions) + Vitest | 160 | **100%** on all pure-logic modules | Schema, RLS, triggers, 7 Edge Functions, pg_cron jobs |
| [`frontend/`](./frontend) | Next.js 14 + TypeScript + Vitest/RTL | 255 | **100%** lines/branches/functions/statements | Full fleet dashboard, realtime-subscribed |
| [`mobile/`](./mobile) | Kotlin/JVM + JUnit 5 + JaCoCo | 69 | **100%** line & branch | Standalone detection engine, no Android SDK dependency |
| [`ai-ml/`](./ai-ml) | Python 3.12 + pytest-cov | 113 | **100%** line & branch | EAR/MAR/head-pitch, state machine, evaluation harness |
| **Total** | | **629** | | All suites pass with a hard coverage gate (build/CI fails below 100%) |

Every module's coverage config is configured to **fail the build** if coverage regresses below 100% (`pytest-cov --cov-fail-under=100`, `vitest coverage.thresholds`, JaCoCo `jacocoTestCoverageVerification`, Clarinet lcov). Where something genuinely can't be exercised outside its native runtime (Deno-only Edge Function wiring, RLS policies that need a live Postgres instance, Android-only camera/UI code), it's explicitly excluded and documented in that module's README — never silently counted as covered.

## Module quickstarts

**Smart contracts** — [`contracts/`](./contracts)
```bash
cd contracts && npm install && npm test
```
SIP-010 `guard-token` + `reward-settlement` (daily mint cap, double-settlement prevention via a `settled-rewards` map, owner-gated). `clarinet check` passes clean.

**Backend** — [`backend/`](./backend)
```bash
cd backend && npm install && npm run coverage
```
Full schema + RLS from the Backend PRD, `compute_safety_score` trigger, 7 Edge Functions (`verify-session`, `calculate-reward`, `trigger-payout`, `send-alert-notification`, `redeem-reward`, `reconcile-rewards`, `generate-fleet-reports`), and `pg_cron` jobs (reward reconciliation every 5 minutes, weekly fleet-report generation) wired via `pg_net` + Supabase Vault secrets.

**Web fleet dashboard** — [`frontend/`](./frontend)
```bash
cd frontend && npm install && npm run dev        # http://localhost:3000
cd frontend && npm run test:coverage
```
Runs against an in-memory demo data source out of the box (no Supabase project required) — see `frontend/README.md` for wiring a real one via `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Mobile detection engine** — [`mobile/`](./mobile)
```bash
cd mobile && ./gradlew test jacocoTestReport jacocoTestCoverageVerification
```
A plain Kotlin/JVM library (no `android.*` imports) implementing EAR/MAR/head-pitch feature extraction and the NORMAL→SOFT→VIBRATION→CRITICAL detection state machine, designed to drop into the real Android app as a Gradle module. CameraX/MediaPipe/Compose/Room/WorkManager integration needs an Android SDK/emulator this environment doesn't have — see `mobile/README.md` for the documented integration seam.

**AI/ML prototype** — [`ai-ml/`](./ai-ml)
```bash
cd ai-ml && python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" && pytest
```
Python prototype of the same feature-extraction and state-machine logic (fast iteration, ports to the Kotlin module above), plus a reusable evaluation harness (critical-event recall/precision, false-positive rate/hour, detection latency, per-condition breakdown) and named bias/fairness fixtures (low light, sunglasses/eyes-not-visible fallback, head coverings, facial hair, skin tone).

## Design decisions worth knowing about

A few gaps the PRDs deliberately left open were resolved during implementation — each is documented in its module's README, summarized here:

- **`as-contract` fix in `reward-settlement.clar`** — the PRD's own contract sketch had `guard-token.mint` check `tx-sender`, which stays the original caller through a `contract-call?` and would have made minting always fail once `reward-settlement` was set as the authorized minter. Fixed with a standard `as-contract` wrap.
- **Daily mint-cap reset** — implemented against `burn-block-height` with a documented `~144 blocks/day` approximation (Clarity has no wall-clock time).
- **GPS continuity check** — validates reported distance against haversine straight-line distance plus a configurable plausible-speed cap (180 km/h default).
- **Safety-score bands** (dashboard) — good ≥80, warning 60–79, critical <60 — not specified in the PRD, documented as a choice.
- **Head-pitch estimation** (mobile + ai-ml) — a documented 2D geometric proxy (nose-tip vs. eye-corner-line, normalized by face height), explicitly not a calibrated Euler angle; limitation vs. a full solvePnP approach is called out per the AI/ML PRD's own open question.
- **Sunglasses / eyes-not-visible fallback** — `EAR` returns a sentinel instead of a fabricated "eyes open" reading; the state machine routes through head-pitch + yawn signals instead, per PRD Section 11.

## Non-goals (v1, per the PRDs)

No raw video ever leaves the device or touches the backend. No iOS build. No DeFi features on the token contract. No cloud inference. No mainnet token launch ahead of real fleet/insurer revenue funding the reward pool. See `docs/` for the full reasoning behind each.

## License

Proprietary — DataNerds Solutions. Not licensed for external use. See [`LICENSE`](./LICENSE).

