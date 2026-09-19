# AlertGuard Fleet Dashboard

Web fleet dashboard for AlertGuard — real-time driver safety monitoring, reporting,
and redemption administration for fleet managers/admins. Built per
`docs/AlertGuard-Frontend-PRD.md` (Sections 3, 7–10, 12, 15 — web scope only) and
`docs/AlertGuard-Backend-PRD.md` (Sections 4, 6–8 — schema, RLS, realtime, REST shape).

Stack: Next.js 14 (App Router) + TypeScript + Tailwind CSS + `@supabase/supabase-js`
+ `@supabase/ssr` (cookie-based session handling for Server Components,
Middleware and the OAuth callback Route Handler).

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

That's the complete list — there is no `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
var in this app, and there shouldn't be one. Google's OAuth client credentials
live entirely in the Supabase dashboard (Authentication -> Providers -> Google);
this app only ever talks to Supabase Auth, never to Google directly.

`lib/data/get-data-source.ts` is the single call site that decides demo vs. real
per request; `lib/supabase-client.ts`/`lib/supabase-server.ts` throw a clear error
if you construct a live client without the two vars above set.

#### Manual step: Supabase Redirect URLs (real auth only)

Real Google sign-in round-trips through `app/auth/callback/route.ts`. Supabase
will only redirect back to a URL you've explicitly allowlisted — this is a
one-time **dashboard** step, not something this repo's code can do for you:

1. Supabase dashboard -> **Authentication -> URL Configuration -> Redirect URLs**
2. Add `http://localhost:3000/auth/callback` (local dev) and
   `https://<your-production-domain>/auth/callback` (deployed).

Do **not** touch the Google Cloud Console OAuth client's redirect URI for this —
it should already correctly point at Supabase's own
`https://<project-ref>.supabase.co/auth/v1/callback`, which is a different URL
from this app's `/auth/callback` and is unrelated to the step above.

### Demo vs. real auth

Whether the app runs in demo or real-auth mode is decided once, by the same
check used throughout (`NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`
set or not) — both paths are live in this codebase side by side, not a stub
that got replaced:

- **Demo mode** (env vars unset): `getDataSource()`/`getServerDataSource()`
  (`lib/data/get-data-source.ts`) return an in-memory `AlertGuardDataSource`
  (`lib/data/fake-data-source.ts`) seeded from `lib/data/demo-seed.ts` — a small
  fictional "Lacoco Fleet" with a few drivers, sessions, drowsiness events,
  rewards, redemptions, and two report periods. Every screen renders against
  this data with no network calls. `LoginClient` renders the demo role
  selector, and `lib/auth/fleet-context.ts`'s `getFleetContext()` returns the
  `demo` branch using the "mgr-1" (Ada Obi, fleet_manager) fixture profile.
  `npx next build` succeeds in this mode with no env vars present (verified).

- **Real mode** (env vars set): `LoginClient` renders a real "Continue with
  Google" button (`supabase.auth.signInWithOAuth`, via the browser client in
  `lib/supabase-browser.ts`). `app/auth/callback/route.ts` completes the
  OAuth code exchange and writes the session cookie. `middleware.ts` refreshes
  that cookie on every request and gates unauthenticated visitors out of the
  dashboard routes. `app/(dashboard)/layout.tsx` resolves the signed-in
  fleet manager/admin's `profiles` row via `lib/auth/fleet-context.ts`'s
  `getFleetContext()`, redirecting non-fleet-managers to `/download` (PRD
  Section 8.1) and rendering a "no fleet assigned" message if `fleet_id` is
  null. Every `app/(dashboard)/**/page.tsx` reads through
  `getServerDataSource()`, which builds the `AlertGuardDataSource` from the
  *session-bound* server client (`lib/supabase-server.ts`, via `@supabase/ssr`
  + `next/headers`' `cookies()`) instead of a bare anon-key client — this is
  what makes the real project's RLS policies (which key off `auth.uid()`)
  actually authorize the query instead of silently returning zero rows.

## Architecture

- `lib/types.ts` — TypeScript types mirroring the Supabase schema (`profiles`,
  `fleets`, `devices`, `driving_sessions`, `drowsiness_events`,
  `session_verifications`, `rewards`, `redemptions`, `fleet_reports`), plus a few
  dashboard-only derived shapes (`DriverListRow`, `FleetOverviewData`, etc).
- `lib/data/data-source.ts` — `AlertGuardDataSource`, the thin interface every data
  function is written against (`getProfiles`, `getDrivingSessions`, ...). This is
  the "swappable client" boundary.
  - `lib/supabase-client.ts` implements it against real `@supabase/supabase-js`,
    wrapping either a bare anon-key client or a session-bound one — the caller
    decides which client to hand it.
  - `lib/data/fake-data-source.ts` implements it in-memory, for tests and demo mode.
- `lib/supabase-server.ts` / `lib/supabase-browser.ts` — `@supabase/ssr` clients
  for Server Components/Route Handlers/Middleware and Client Components
  respectively, both persisting the session to cookies (not localStorage) so
  they see the same session. `lib/supabase-server.ts`'s cookie-adapter
  construction (`buildCookieAdapter`/`buildServerSupabaseClient`) is a plain,
  injectable function tested without a real Next.js request context; only the
  one-line `next/headers` `cookies()` call in `createServerSupabaseClient` is
  wiring, mocked via `vi.mock("next/headers", ...)` in tests.
- `lib/auth/fleet-context.ts` — `getFleetContext()`, wrapped in React's
  `cache()`, resolves the signed-in fleet manager/admin's `profiles` row and
  `fleet_id` for the current request as a discriminated union (`demo` /
  `unauthenticated` / `unauthorized_role` / `no_fleet` / `ok`) — see its doc
  comment for the judgment call on admins with no `fleet_id`.
  `requireFleetId()` is the small helper every dashboard page calls to
  defensively assert the layout already redirected away any unresolved state;
  `requireProfile()` is the same contract for callers that need the signed-in
  user's own `profiles` row instead (e.g. Settings' role-gated "promote user"
  form — see "Promote user to fleet_manager/admin" below), from the same
  already-fetched context, without a second `getFleetContext()` call.
- `lib/auth/middleware-logic.ts` — the pure "should this request redirect to
  /login" decision `middleware.ts` delegates to, so it's unit-tested directly
  rather than through a simulated Next.js request/response pipeline.
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
- `app/**` — App Router pages. `app/(dashboard)/**` Server Components fetch via
  `getServerDataSource()` (session-bound in real mode, demo seed otherwise) and
  pass data to the client components above. `realtimeClient` is passed as `null`
  from pages in this build (no live Supabase socket is configured) — wiring a real
  one is a one-line change per page once a Supabase project exists.
  `app/(dashboard)/layout.tsx` is the auth gate (see "Demo vs. real auth" above);
  `app/auth/callback/route.ts` completes the OAuth flow.
- `middleware.ts` (project root, outside `app/`) — refreshes the Supabase session
  cookie on every request and redirects unauthenticated visitors away from
  dashboard routes, via `lib/auth/middleware-logic.ts`.

### Promote user to fleet_manager/admin

Settings' "Manager accounts" panel (`components/settings/ManagerList.tsx`) lets
a signed-in fleet_manager/admin promote an already-signed-up user — either by
browsing the "Signed-up accounts" picker or by typing an email directly —
replacing "hand-run SQL in the Supabase SQL Editor" with a real in-app flow.

- **The picker** (`listPromotableUsers` Server Action ->
  `list-promotable-users` Edge Function) fetches on mount, scoped server-side
  to what the caller may actually promote: an admin sees every other signed-up
  user, a fleet_manager sees only unassigned drivers or drivers already in
  their own fleet (see `backend/README.md`'s
  "List signed-up accounts to promote" for the full scoping rules). Each row
  has its own Promote button; an admin caller additionally gets a per-row role
  select and (when granting fleet_manager) a Fleet ID input, mirroring the
  manual form below it. A successful promotion removes the row from the
  picker and, if the new role is `fleet_manager`, appends it to the "Manager
  accounts" list above.
- **The manual email form stays as a fallback** for anyone not yet reflected
  in the picker (e.g. a just-signed-up account before a page refresh) —
  unchanged from before.

- **Never touches the Supabase service-role key.** `app/(dashboard)/settings/actions.ts`'s
  `promoteUser` Server Action (`"use server"`) gets the *caller's own*
  session-bound access token via `lib/supabase-server.ts`'s
  `createServerSupabaseClient().auth.getSession()`, then does a
  server-to-server `fetch()` to
  `${NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-user-role` with
  `Authorization: Bearer <that token>` — the same JWT-validation path every
  other end-user Edge Function call uses in this backend, not a privileged
  bypass. The action maps the Edge Function's `reason` strings 1:1
  (`cannot_modify_own_role`, `user_not_found`, `profile_not_ready`,
  `forbidden`, `fleet_id_required`, `invalid_request`) plus a catch-all
  `"error"` for anything it can't classify (missing session, network failure,
  unparseable response), so the UI never has to guess.
- **UI gating mirrors backend authorization, but doesn't replace it.**
  `ManagerList` only offers the "Admin" role option when the signed-in
  caller's own role (threaded down from `app/(dashboard)/settings/page.tsx`'s
  `getFleetContext()` via the new `requireProfile()` helper — see
  "Architecture" above) is `admin`; a fleet_manager caller never even sees
  the option. This is a UX nicety only — `manage-user-role`'s own
  authorization logic (`backend/supabase/functions/_shared/roles.ts`) is the
  actual enforcement point and rejects a `fleet_manager` caller requesting
  `admin` regardless of what the client sends.
- **Every outcome gets its own honest message**: success
  ("`<email>` promoted to `<role>`."), `user_not_found` ("this person needs
  to sign in to AlertGuard at least once before they can be promoted"),
  `forbidden`/`cannot_modify_own_role`, `fleet_id_required` (an admin
  promoting to fleet_manager must enter a fleet ID), or a generic error — no
  optimistic local-state append pretending the call already succeeded.
- **Demo mode is completely unchanged.** `ManagerList` uses the same
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` presence check
  used throughout this frontend (mirrored locally, same as
  `components/login/LoginClient.tsx`, since it's a Client Component); without
  those vars it keeps the original local-`useState`-only "Send invite"
  behavior verbatim — no role selector, no Fleet ID input, no Server Action
  call — so `npm run dev` with no Supabase project stays fully browsable.

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

**Current result: 355 tests, all passing, 100% coverage** (lines/branches/
functions/statements, `coverage.thresholds` in `vitest.config.ts` enforces this —
`npm run test:coverage` fails the build if it regresses).

`vitest.setup.ts` mocks `react`'s `cache` export with an identity fallback:
`React.cache()` (used by `lib/auth/fleet-context.ts`) only exists on the
"react-server" build of the `react` package, which Next.js's own bundler
selects automatically for the Server Components graph but which Vitest (on
Vite, not Next's bundler) never does — without the shim, any module calling
`cache(fn)` at import time throws under test. This is Next.js/React framework
machinery, not app logic under test.

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
  detail, the null-fleet/null-manager-phone fallback branches on Settings/Reports,
  and the defensive `requireFleetId()` throw when the fleet context somehow isn't
  resolved by the time a page renders.
- `lib/auth/fleet-context.ts`: every branch of the `FleetContext` discriminated
  union (`demo`, `unauthenticated` — including the "authenticated but no
  `profiles` row" edge case — `unauthorized_role` for both `driver` and an
  unrecognized role value, `no_fleet` for both `fleet_manager` and `admin`,
  `ok`), against a hand-rolled fake of the supabase-js client.
- `lib/auth/middleware-logic.ts`: the pure redirect decision directly, and
  `app/auth/callback/route.ts`'s `GET` handler directly (valid code, missing
  code, and a failed `exchangeCodeForSession`).
- `app/(dashboard)/layout.tsx`: all five `FleetContext` status branches
  (demo/ok render children, unauthenticated/unauthorized_role redirect,
  no_fleet renders the "contact your admin" message).
- `app/(dashboard)/settings/actions.ts`'s `promoteUser` and `listPromotableUsers`
  Server Actions: missing `NEXT_PUBLIC_SUPABASE_URL`, no session/access
  token, a successful Edge Function response, every known error `reason`, an
  unrecognized reason, an unparseable response body, a non-array `users`
  field, and a thrown `fetch` — `lib/supabase-server.ts` and `fetch` are both
  mocked, no real network call is made.
- `components/settings/ManagerList.tsx`: demo mode unchanged (no role
  selector/Fleet ID input, no Server Action call, local-state-only invite,
  no picker); real mode's role selector (Admin option gated on the caller's
  own role), the Fleet ID input's required-for-fleet_manager /
  optional-for-admin labeling, the client-side `fleet_id_required`
  pre-check, the pending "Sending..." state, and every `promoteUser` outcome
  (success for both roles, `user_not_found`, `forbidden`,
  `cannot_modify_own_role`, and a generic error) for the manual form; the
  "Signed-up accounts" picker's loading/error/empty states, per-candidate
  role select and Fleet ID input (admin caller) vs. single-click promote (fleet_manager
  caller), a per-candidate promotion failure, and the post-unmount fetch
  resolving without updating state.

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
special-cased in the exclude list, per the "keep this list honest" instruction. The
same applies to `lib/auth/fleet-context.ts`'s demo-profile lookup: no null-guard
for a missing "mgr-1" fixture, since `demo-seed.ts` is static and checked in.

`middleware.ts` (project root) is not measured at all — not via an exclusion, but
because `coverage.include` in `vitest.config.ts` only scans `app/**`,
`components/**`, and `lib/**`, and `middleware.ts` lives outside all three, the
same as `tailwind.config.ts`/`next.config.mjs`/`vitest.config.ts` already do. Its
one meaningful decision (which paths to redirect) is pulled out into
`lib/auth/middleware-logic.ts`, which *is* covered; what's left in `middleware.ts`
is Next.js/`@supabase/ssr` wiring (constructing the request/response cookie
adapter) with no branches of its own.

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
