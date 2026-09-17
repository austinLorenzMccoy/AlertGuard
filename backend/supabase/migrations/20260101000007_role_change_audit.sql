-- AlertGuard role-promotion audit trail + email-to-user-id lookup helper.
-- Feature: "promote user to fleet_manager/admin" from the fleet dashboard's
-- Settings page (manage-user-role Edge Function, _shared/roles.ts).
--
-- Design notes (mirrors 20260101000006_wallet_infrastructure.sql's pattern):
--
-- 1. role_change_events is an append-only audit trail of every role/fleet_id
--    change made through manage-user-role — who did it (actor_id), who it was
--    done to (target_id), and the before/after role + fleet_id. RLS enabled,
--    ZERO client-facing policies (same deny-by-omission pattern as
--    `wallet_keys`/`wallet_connect_challenges`/`rewards`/`redemptions`): a
--    role-change audit log must never be readable, insertable, or alterable
--    by anon/authenticated — only the service role used inside
--    manage-user-role/index.ts can touch this table (service_role has
--    BYPASSRLS). There is deliberately no "drivers/fleet managers can read
--    their own audit rows" policy here (unlike wallet_events) — who promoted
--    whom is an admin-facing concern, not something surfaced in-app yet, so
--    the safer default is no client access at all until a real need for one
--    is specified.
--
-- 2. find_user_id_by_email(text) is a SECURITY DEFINER helper so
--    manage-user-role's service-role client can resolve an email address to
--    an auth.users id without exposing the `auth` schema (or an email
--    enumeration oracle) to PostgREST/anon/authenticated at all. `auth.users`
--    is not exposed via the API by default and has no `profiles`-style RLS
--    policies of its own to lean on, so a SECURITY DEFINER function reading
--    it directly (same technique as current_role()/current_fleet_id() in
--    20260101000004_rls_policies.sql, and custom_access_token_hook in
--    20260101000002_auth_trigger.sql) is the establish pattern for
--    "read something in `auth` from application code" in this backend.
--    EXECUTE is explicitly revoked from PUBLIC and granted only to
--    service_role — an anon/authenticated caller must never be able to probe
--    "does this email have an account" via PostgREST's RPC endpoint.

-- ---------------------------------------------------------------------------
-- role_change_events (audit trail)
-- ---------------------------------------------------------------------------
create table public.role_change_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  old_role text not null check (old_role in ('driver', 'fleet_manager', 'admin')),
  new_role text not null check (new_role in ('driver', 'fleet_manager', 'admin')),
  old_fleet_id uuid references public.fleets(id),
  new_fleet_id uuid references public.fleets(id),
  created_at timestamptz not null default now()
);

create index role_change_events_actor_id_idx on public.role_change_events (actor_id);
create index role_change_events_target_id_idx on public.role_change_events (target_id);

alter table public.role_change_events enable row level security;

-- NO POLICIES for anon/authenticated — see note 1 above. Written and read
-- exclusively by manage-user-role/index.ts under the service role.

-- ---------------------------------------------------------------------------
-- find_user_id_by_email
-- ---------------------------------------------------------------------------
create function public.find_user_id_by_email(target_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(target_email) limit 1;
$$;

revoke execute on function public.find_user_id_by_email(text) from public;
grant execute on function public.find_user_id_by_email(text) to service_role;
