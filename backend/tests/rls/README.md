# RLS test scripts

These are [pgTAP](https://pgtap.org/) test scripts that assert the Row Level
Security isolation described in Backend PRD Section 6, plus the adversarial
scenarios called out in Section 12 (Step 3: "write test cases per role ...
to confirm isolation"; Step 4: "Confirm RLS blocks a driver from writing to
another driver's session").

## Requirements to run these

pgTAP is a Postgres extension; these scripts run **inside** a Postgres
database, driven by `pg_prove` (or plain `psql` + manual assertions). They
require:

- Docker (for `supabase start`'s local Postgres), or any Postgres 15+ with
  the `pgtap` extension available
- The `supabase` CLI

This environment does not have Docker available, so these scripts are
**written but not executed** here. They are not counted toward the 100%
coverage figure in `backend/README.md` — that figure applies only to the
TypeScript logic layer under `supabase/functions/_shared/`.

## How to run them once Docker is available

```bash
cd backend
supabase start                     # spins up local Postgres + applies migrations + seed.sql
psql "$(supabase status -o json | jq -r '.DB_URL')" -c 'create extension if not exists pgtap;'
pg_prove --ext .sql -d "$(supabase status -o json | jq -r '.DB_URL')" tests/rls/*.sql
```

Or run a single file directly with `psql` and read the TAP output:

```bash
psql "$(supabase status -o json | jq -r '.DB_URL')" -f tests/rls/01_driver_isolation.sql
```

## What each file covers

- `01_driver_isolation.sql` — a driver can see/insert only their own
  `driving_sessions` / `drowsiness_events` / `rewards` / `redemptions` rows,
  and cannot read or write another driver's rows (the Step 4 adversarial
  test).
- `02_fleet_manager_isolation.sql` — a fleet manager sees only their own
  fleet's drivers/sessions/events/rewards/reports, not another fleet's.
- `03_admin_service_role.sql` — confirms there are no client-facing RLS
  policies granting a JWT `role = 'admin'` claim special access (per the
  PRD's "admins bypass RLS via a service-role key... never exposed to the
  client"), and that the service role does bypass RLS entirely.
- `04_privilege_escalation.sql` — a driver cannot self-set
  `driving_sessions.status = 'verified'`, cannot mutate an already-verified
  session, cannot self-promote their own `profiles.role`/`fleet_id`, and
  cannot insert `drowsiness_events` against a session that isn't theirs or
  isn't `active`.

## Test technique

Each script uses `set local role` / `set local request.jwt.claims` to
impersonate a given Supabase JWT (matching how PostgREST sets these on each
request) inside a transaction, then asserts query results with pgTAP's
`results_eq`, `is`, `ok`, and `throws_ok` functions. Every script wraps its
assertions in `begin; select plan(n); ... select * from finish(); rollback;`
so no test data outsteps its own transaction.
