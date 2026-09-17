-- AlertGuard scheduled jobs (pg_cron + pg_net)
-- PRD reference: Backend PRD Section 8 (Step 8, reconciliation) and
-- Section 10/12 Step 10 (weekly fleet reporting); Smart Contract PRD
-- Section 6 ("a scheduled Edge Function checks any rewards row stuck in
-- pending for more than 5 minutes").
--
-- This migration registers REAL cron jobs in Postgres (via pg_cron) that call
-- the deployed Edge Functions over HTTP (via pg_net), rather than leaving
-- reconciliation/report-generation as functions that must be invoked
-- manually. It is additive on top of the reconcile-rewards and
-- generate-fleet-reports Edge Functions + their pure-logic modules
-- (supabase/functions/_shared/reconciliation.ts, fleetReports.ts) and their
-- Vitest coverage — this migration only wires the *scheduling*.
--
-- ---------------------------------------------------------------------------
-- Secrets: this migration deliberately does NOT hardcode a project URL,
-- service-role key, or internal shared secret. Those are pulled at cron-run
-- time from Supabase Vault (`vault.decrypted_secrets`), the documented
-- Supabase pattern for this exact "pg_cron calling an Edge Function" case.
--
-- Before these jobs can actually fire successfully against a real project,
-- populate three secrets once (via the Supabase dashboard's Vault UI, or
-- `select vault.create_secret(...)` run manually — NOT via a migration file,
-- since migrations are committed to git and secrets must never be):
--
--   select vault.create_secret('https://<project-ref>.functions.supabase.co', 'edge_functions_base_url');
--   select vault.create_secret('<service-role-key>',                          'service_role_key');
--   select vault.create_secret('<INTERNAL_FUNCTION_SECRET value>',            'internal_function_secret');
--
-- (`INTERNAL_FUNCTION_SECRET` here must match the same env var configured on
-- the Edge Functions themselves — see backend/README.md — so
-- `isInternalCall()` in supabase/functions/_shared/auth.ts accepts the call.)
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- pg_cron and pg_net install into their own schemas by default in Supabase-
-- hosted/CLI projects (`cron`, `net`); grant usage so migrations/functions
-- running as postgres can call them (already true for the migration role,
-- this is defensive/explicit).
grant usage on schema cron to postgres;
grant usage on schema net to postgres;

-- ---------------------------------------------------------------------------
-- Job 1: reward reconciliation
-- Schedule: every 5 minutes ("*/5 * * * *")
-- Calls: POST {edge_functions_base_url}/reconcile-rewards
-- Body: {} (the function itself queries all status='pending' rewards and
--   applies the >5-minute-old staleness threshold from
--   supabase/functions/_shared/reconciliation.ts)
-- ---------------------------------------------------------------------------
select cron.schedule(
  'reconcile-pending-rewards',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/reconcile-rewards',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_function_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- ---------------------------------------------------------------------------
-- Job 2: weekly fleet_reports aggregation
-- Schedule: weekly, Sunday 00:00 UTC ("0 0 * * 0")
-- Calls: POST {edge_functions_base_url}/generate-fleet-reports
-- Body: {} (the function computes "the week that just ended" relative to
--   its own invocation time via getPreviousWeekPeriod() in
--   supabase/functions/_shared/fleetReports.ts)
-- ---------------------------------------------------------------------------
select cron.schedule(
  'generate-weekly-fleet-reports',
  '0 0 * * 0',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/generate-fleet-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key'),
      'x-internal-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'internal_function_secret')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- ---------------------------------------------------------------------------
-- Verifying / managing these jobs (requires a running Supabase project —
-- `supabase start` locally, or the Supabase SQL editor against a real
-- project; pg_cron does not run inside a plain `psql` against a throwaway
-- Postgres unless the extension is installed and available, which is true
-- for Supabase-provided Postgres images but not necessarily every local
-- install):
--
--   -- list registered jobs (schedule, command, active flag):
--   select jobid, jobname, schedule, command, active from cron.job;
--
--   -- inspect recent run history / failures:
--   select * from cron.job_run_details order by start_time desc limit 20;
--
--   -- temporarily disable a job without deleting it:
--   select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'reconcile-pending-rewards'), active := false);
--
--   -- change a job's schedule (e.g. tighten reconciliation to every minute):
--   select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'reconcile-pending-rewards'), schedule := '* * * * *');
--
--   -- remove a job entirely:
--   select cron.unschedule('reconcile-pending-rewards');
--   select cron.unschedule('generate-weekly-fleet-reports');
-- ---------------------------------------------------------------------------
