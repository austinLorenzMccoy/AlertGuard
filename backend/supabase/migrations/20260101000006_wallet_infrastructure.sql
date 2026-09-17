-- AlertGuard custodial wallet infrastructure
-- PRD reference: Smart Contract PRD Section 3 ("Wallet Model — The Decision")
-- and Section 7 ("Security Model"); implements Section 10 Phase B items 5-7
-- (keypair generation on signup, wallet export, "connect external wallet").
--
-- Design notes:
--
-- 1. wallet_keys holds each driver's CUSTODIAL private key, envelope-encrypted
--    (see _shared/wallet-crypto.ts — AES-256-GCM, master key injected from
--    Supabase Vault / the WALLET_MASTER_ENCRYPTION_KEY Edge Function secret,
--    never stored in this table). One row per driver (driver_id is UNIQUE) —
--    a driver has at most one custodial key on file at a time. This table
--    gets RLS ENABLED but deliberately NO POLICIES AT ALL for any client
--    role (anon/authenticated), mirroring exactly how `rewards` and
--    `redemptions` are hardened in 20260101000004_rls_policies.sql (see that
--    file's note 5): with RLS enabled and zero policies, PostgREST's
--    anon/authenticated roles can never select/insert/update/delete a single
--    row, at any time, under any condition — only the `service_role` used
--    inside Edge Functions can touch this table, because `service_role` has
--    BYPASSRLS (see 20260101000004's note 4 on how admin/service access is
--    enforced the same way). A private key must never be reachable through
--    PostgREST, full stop — that is enforced here at the database layer, not
--    just by "the client app doesn't happen to query this table".
--
-- 2. wallet_events is an append-only audit trail (generated / exported /
--    connected_external / export_viewed) — PRD Section 3's "log the export
--    event for the driver's own audit trail". Unlike wallet_keys, a driver
--    MAY read their own audit rows (their own transparency into what
--    happened to their own wallet), so it gets a SELECT-own policy, but still
--    no client INSERT/UPDATE/DELETE policy — every row is written exclusively
--    by the wallet Edge Functions under the service role, so the audit trail
--    itself cannot be forged or tampered with by a client. `metadata` is
--    jsonb for event-specific detail (e.g. the new address on a
--    `connected_external` event) — private key material must NEVER be placed
--    in this column, by construction of the application code that writes it
--    (see _shared/wallet.ts).
--
-- 3. wallet_connect_challenges is the one-time nonce table backing
--    "connect external wallet" (PRD Section 3 step 4c / Section 10 item 7):
--    a driver requests a challenge, signs it with an external wallet
--    (Leather/Xverse via sats-connect — see WALLET_INTEGRATION.md), and
--    `connect-external-wallet` verifies the signature and marks the
--    challenge `consumed_at` so it can never be replayed. Same
--    service-role-only access pattern as wallet_keys — a client has no
--    legitimate reason to read or write this table directly; it only ever
--    calls the `request-wallet-connect-challenge` / `connect-external-wallet`
--    Edge Functions, which use the service role internally.

-- ---------------------------------------------------------------------------
-- wallet_keys
-- ---------------------------------------------------------------------------
create table public.wallet_keys (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null unique references public.profiles(id) on delete cascade,
  encrypted_private_key text not null, -- envelope-encrypted (AES-256-GCM); never plaintext
  encryption_key_id text not null, -- which master key/version encrypted this row (rotation support)
  wallet_type text not null check (wallet_type in ('custodial', 'external')),
  created_at timestamptz not null default now()
);

create index wallet_keys_driver_id_idx on public.wallet_keys (driver_id);

-- ---------------------------------------------------------------------------
-- wallet_events (audit trail)
-- ---------------------------------------------------------------------------
create table public.wallet_events (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  event_type text not null check (event_type in ('generated', 'exported', 'connected_external', 'export_viewed')),
  metadata jsonb not null default '{}'::jsonb, -- e.g. { "address": "ST..." } on connected_external — NEVER key material
  created_at timestamptz not null default now()
);

create index wallet_events_driver_id_idx on public.wallet_events (driver_id);
create index wallet_events_created_at_idx on public.wallet_events (created_at);

-- ---------------------------------------------------------------------------
-- wallet_connect_challenges (one-time nonce, anti-replay for connect-external-wallet)
-- ---------------------------------------------------------------------------
create table public.wallet_connect_challenges (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null references public.profiles(id) on delete cascade,
  nonce text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index wallet_connect_challenges_driver_id_nonce_idx
  on public.wallet_connect_challenges (driver_id, nonce);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.wallet_keys enable row level security;
alter table public.wallet_events enable row level security;
alter table public.wallet_connect_challenges enable row level security;

-- wallet_keys: NO POLICIES for anon/authenticated — see note 1 above. This is
-- intentionally a deny-all-by-omission table, exactly like `rewards` and
-- `redemptions` (20260101000004, note 5), just with the additional emphasis
-- that this table also has no client SELECT policy, since it holds
-- ciphertext of driver private keys and must never be listable/readable by
-- PostgREST under any role except service_role (which bypasses RLS).

-- wallet_events: a driver may read their own audit trail, per PRD Section 3
-- ("log the export event for the driver's own audit trail").
create policy "drivers_select_own_wallet_events"
  on public.wallet_events for select
  using (driver_id = auth.uid());

-- No insert/update/delete policy: wallet_events is written exclusively by the
-- wallet Edge Functions (generate-wallet, export-wallet-key,
-- connect-external-wallet) under the service role, so the audit trail cannot
-- be forged, edited, or deleted by a client.

-- wallet_connect_challenges: NO POLICIES for anon/authenticated — see note 3
-- above. A client never reads or writes this table directly; it only calls
-- request-wallet-connect-challenge / connect-external-wallet, which use the
-- service role internally.
