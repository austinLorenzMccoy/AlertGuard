# AlertGuard Fleet Dashboard

Web fleet dashboard for AlertGuard — real-time driver safety monitoring, reporting,
and redemption administration for fleet managers/admins. Built per
`docs/AlertGuard-Frontend-PRD.md` (Sections 3, 7–10, 12, 15 — web scope only) and
`docs/AlertGuard-Backend-PRD.md` (Sections 4, 6–8 — schema, RLS, realtime, REST shape).

Stack: Next.js 14 (App Router) + TypeScript + Tailwind CSS + `@supabase/supabase-js`.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase env vars set, the app runs in **demo
mode** (see below) and is fully browsable without a backend.

### Required env vars (real backend)

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public API key |

Neither a real Supabase project nor Google OAuth is wired up in this build — both
are out of scope per the task brief. `lib/supabase-client.ts` throws a clear error
if you construct a live client without these vars set; `lib/data/get-data-source.ts`
is the single call site that decides live vs. demo, so wiring a real project later
is a one-file change.

### Demo mode

When the env vars above are unset, `getDataSource()` (`lib/data/get-data-source.ts`)
returns an in-memory `AlertGuardDataSource` (`lib/data/fake-data-source.ts`) seeded
from `lib/data/demo-seed.ts` — a small fictional "Lacoco Fleet" with a few drivers,
sessions, drowsiness events, rewards, redemptions, and two report periods. Every
screen renders against this data with no network calls. `npx next build` succeeds
in this mode too (verified).

Login's "Continue with Google" button is a stand-in: since no real Google OAuth is
wired, a "demo role" selector stands in for the role Supabase Auth would put on the
session, so the role-based redirect logic (`lib/logic/auth-redirect.ts`) is still
exercised end-to-end.

## Architecture

- `lib/types.ts` — TypeScript types mirroring the Supabase schema (`profiles`,
  `fleets`, `devices`, `driving_sessions`, `drowsiness_events`,
  `session_verifications`, `rewards`, `redemptions`, `fleet_reports`), plus a few
  dashboard-only derived shapes (`DriverListRow`, `FleetOverviewData`, etc).
- `lib/data/data-source.ts` — `AlertGuardDataSource`, the thin interface every data
  function is written against (`getProfiles`, `getDrivingSessions`, ...). This is
  the "swappable client" boundary.
  - `lib/supabase-client.ts` implements it against real `@supabase/supabase-js`.
  - `lib/data/fake-data-source.ts` implements it in-memory, for tests and demo mode.
- `lib/data/{overview,drivers,alerts,reports,redemptions}.ts` — the
  `getFleetOverview` / `getDrivers` / `getDriverDetail` / `getLiveAlerts` /
  `getFleetReports` / `getRedemptions` functions called from `app/**/page.tsx`
  server components. Each takes a data source + params and returns typed,
  UI-ready data — unit-tested against the fake data source, no network involved.
- `lib/logic/*.ts` — pure business logic, the highest-value test target:
  - `safety-score.ts` — score → band classification (see thresholds below)
  - `trend.ts` — session history → sparkline/trend-chart points
  - `csv-export.ts` / `pdf-export.ts` — export data shaping (CSV string / PDF
    document description; a real PDF renderer is hidden behind the `PdfRenderer`
    interface so the shaping logic is tested, not a PDF binary)
  - `auth-redirect.ts` — role → post-login route
  - `report-query.ts` — date-range preset → concrete range → report filtering
  - `driver-list.ts` — driver list sort/filter
  - `redemptions-filter.ts` — redemption status filtering/counting
  - `format.ts` — phone masking, email validation
- `lib/hooks/useRealtimeChannel.ts` — generic wrapper around the Supabase Realtime
  `postgres_changes` pattern from Backend PRD Section 7, typed against a minimal
  `RealtimeClientLike` interface (not full supabase-js) so it's mockable in tests.
  `useLiveAlerts.ts` and `useLiveDriverGrid.ts` build on it for the Live alerts feed
  and Overview driver grid.
- `components/**` — one folder per screen area, split into presentational pieces
  and a `*Client.tsx` component that owns interactive state (sort/filter, realtime
  subscription, forms).
- `app/**` — App Router pages. Server components fetch via `getDataSource()` and
  pass data to the client components above. `realtimeClient` is passed as `null`
  from pages in this build (no live Supabase socket is configured) — wiring a real
  one is a one-line change per page once a Supabase project exists.

### Design tokens

`tailwind.config.ts` extends the Tailwind theme with the exact hex values from
Frontend PRD Section 3 (`ink`, `ink-2`, `ink-3`, `fog`, `mist`, `line`, `accent`,
`brake`), plus `font-display`/`font-body` mapped to Fraunces/Space Grotesk loaded
via `next/font/google` in `app/layout.tsx` (build-time bundled, no runtime CDN).

### Safety-score bands

The PRD doesn't specify exact cutoffs, so `lib/logic/safety-score.ts` documents a
concrete choice: **good ≥ 80, warning 60–79, critical < 60**. `good` matches the
"verified safe driving" framing used for reward eligibility; the other two bands
give a fleet manager a clear middle "needs attention" state before critical.

### Accessibility (PRD Section 12)

- All interactive elements are real `<button>`/`<a>` (via `next/link`) — no bare
  clickable `div`s anywhere in the component tree.
- `Button`/`IconButton` enforce a 44×44px minimum touch target (`min-h-touch
  min-w-touch` Tailwind utilities backed by a `touch: 44px` spacing token).
  `IconButton`'s `aria-label` prop is required, not optional, at the type level.
- `StatusBadge`/`ScoreBar` always pair color with an icon glyph and text label —
  never color alone — for score bands and redemption/reward statuses.
- Sort controls, tabs, and toggles use proper ARIA (`aria-current`, `role="tab"` +
  `aria-selected`, `aria-expanded`, `role="progressbar"`).

## Testing

```bash
npm test              # vitest run (single pass)
npm run test:watch    # vitest watch mode
npm run test:coverage # vitest run --coverage
```

Stack: Vitest + `@testing-library/react` + `@testing-library/jest-dom` +
`@testing-library/user-event`, jsdom environment, v8 coverage provider.

**Current result: 255 tests, all passing, 100% coverage** (lines/branches/
functions/statements, `coverage.thresholds` in `vitest.config.ts` enforces this —
`npm run test:coverage` fails the build if it regresses).

What's covered:
- Every `lib/logic/*.ts` module, with tests for each branch (band thresholds at
  their boundaries, null/undefined fallbacks on both sides of `??` comparisons,
  CSV quoting edge cases, PDF aggregation across multiple report periods, etc).
- Every `lib/data/*.ts` function against `createFakeDataSource`, including empty
  results, missing-relation fallbacks (unknown driver, no active session), and
  filter combinations.
- `lib/supabase-client.ts` against a hand-rolled fake of the supabase-js fluent
  query builder (`.from().select().eq().in()`), covering every filter branch and
  the Supabase error-response path for each of the 7 table accessors.
- `useRealtimeSubscription`/`useLiveAlerts`/`useLiveDriverGrid` against a fake
  `RealtimeClientLike` channel — tests simulate a `postgres_changes` INSERT
  payload the same shape as Backend PRD Section 7's example and assert the hook's
  state update (the `updateDashboard`-equivalent), mirroring the realtime pattern
  Playwright/Cypress would exercise against a live socket.
- Every component: render + key interactions (sort clicks, filter selects,
  redemption approve/reject, CSV/PDF export buttons, Settings form inputs and
  invite validation, session-timeline expand/collapse).
- Role-based redirect logic, both directly (`auth-redirect.test.ts`) and through
  `LoginClient`'s demo-role flow.
- Every `app/**/page.tsx`, by calling the async Server Component function directly
  and rendering its returned element — including the `notFound()` branch on driver
  detail and the null-fleet/null-manager-phone fallback branches on Settings/Reports.

### Coverage exclude list

```ts
exclude: [
  "**/*.test.ts",
  "**/*.test.tsx",
  "app/layout.tsx",
  "lib/data/demo-seed.ts",
  "**/*.d.ts",
]
```

| Path | Why excluded |
|---|---|
| `**/*.test.ts`, `**/*.test.tsx` | Test files aren't production code; instrumenting them just adds noise (e.g. an unreachable branch in a table-driven test case) that has nothing to do with app coverage. |
| `app/layout.tsx` | Pure JSX shell — font (`next/font/google`) and `<html>/<body>` wiring plus static `metadata`, no conditionals or data transforms. |
| `lib/data/demo-seed.ts` | Static fixture data (object/array literals only) for demo mode — no branches to exercise. |
| `**/*.d.ts` | Ambient type declarations (e.g. `next-env.d.ts`), no runtime code. |

Everything else — including every page, every component, every hook, and the two
schema-only files (`lib/types.ts`, `lib/data/data-source.ts`, which are `interface`/
`type` declarations with no emitted JS and so trivially show 0/0 = 100%) — is
included and held to the 100% threshold. Dead/unreachable branches found along the
way (e.g. a `switch` `default` case TypeScript could already prove exhaustive, or a
`|| 1` divide-by-zero guard that turned out to be mathematically unreachable given
the function's own floor/ceiling clamping) were removed from the source rather than
special-cased in the exclude list, per the "keep this list honest" instruction.

## Project layout

```
app/                          Next.js App Router pages
  login/, download/           Public routes
  (dashboard)/                Authenticated shell (Sidebar) + one folder per screen:
    overview/, drivers/, drivers/[id]/, alerts/, reports/, redemptions/, settings/
components/                   One folder per screen area (ui/, layout/, overview/, ...)
lib/
  types.ts                    Schema-mirroring types
  supabase-client.ts          Real Supabase client + AlertGuardDataSource impl
  data/                       data-source interface, fake impl, demo seed, per-screen queries
  logic/                      Pure business logic (see above)
  hooks/                      Realtime subscription hooks
  dom/                        Browser-only side effects (file download)
```
