-- AlertGuard initial schema
-- PRD reference: AlertGuard-Backend-PRD.md, Section 4 (Data Model)
--
-- Notes on ordering:
--   `profiles` references `fleets(id)` and `fleets` references `profiles(id)` (owner_id),
--   so `fleets` is created first without the FK cycle being a problem: we create
--   `fleets` before `profiles`, then add `profiles.fleet_id` FK in the same migration
--   (Postgres allows forward references inside a single transaction as long as both
--   tables exist by the time the FK constraint is added).

create extension if not exists pgcrypto; -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Fleets: logistics/ride-hail operators
-- ---------------------------------------------------------------------------
create table fleets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid, -- FK to profiles added after profiles exists
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Profiles: extends Supabase auth.users
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text unique,
  role text not null check (role in ('driver', 'fleet_manager', 'admin')),
  fleet_id uuid references fleets(id),
  wallet_address text, -- Stacks address for reward payout
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table fleets
  add constraint fleets_owner_id_fkey foreign key (owner_id) references profiles(id);

-- ---------------------------------------------------------------------------
-- Devices: one driver may have multiple devices over time
-- ---------------------------------------------------------------------------
create table devices (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references profiles(id) on delete cascade,
  device_model text,
  os_version text,
  app_version text,
  device_attestation_key text, -- used for anti-spoofing checks
  last_active timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Driving sessions
-- ---------------------------------------------------------------------------
create table driving_sessions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references profiles(id) on delete cascade,
  device_id uuid references devices(id),
  fleet_id uuid references fleets(id),
  start_time timestamptz not null,
  end_time timestamptz,
  start_lat numeric,
  start_lng numeric,
  end_lat numeric,
  end_lng numeric,
  distance_km numeric,
  gps_trace_hash text, -- hash of the full GPS trace, stored client-side, verified server-side
  status text not null default 'active' check (status in ('active', 'completed', 'flagged', 'verified')),
  safety_score numeric, -- 0-100, computed on completion
  created_at timestamptz not null default now()
);

create index driving_sessions_driver_id_idx on driving_sessions (driver_id);
create index driving_sessions_fleet_id_idx on driving_sessions (fleet_id);
create index driving_sessions_status_idx on driving_sessions (status);

-- ---------------------------------------------------------------------------
-- Drowsiness events logged during a session
-- ---------------------------------------------------------------------------
create table drowsiness_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references driving_sessions(id) on delete cascade,
  event_type text not null check (event_type in ('eye_closure', 'yawn', 'head_nod', 'blink_rate_drift')),
  severity text not null check (severity in ('soft', 'vibration', 'critical')),
  device_confidence numeric, -- model confidence 0-1
  occurred_at timestamptz not null,
  lat numeric,
  lng numeric
);

create index drowsiness_events_session_id_idx on drowsiness_events (session_id);
create index drowsiness_events_severity_idx on drowsiness_events (severity);

-- ---------------------------------------------------------------------------
-- Session verification results (anti-spoofing)
-- ---------------------------------------------------------------------------
create table session_verifications (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references driving_sessions(id) on delete cascade,
  gps_continuity_ok boolean,
  device_attestation_ok boolean,
  timestamp_consistency_ok boolean,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'passed', 'failed')),
  verified_at timestamptz
);

create index session_verifications_session_id_idx on session_verifications (session_id);

-- ---------------------------------------------------------------------------
-- Rewards ledger (off-chain record, mirrors on-chain settlement)
-- ---------------------------------------------------------------------------
create table rewards (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references profiles(id) on delete cascade,
  session_id uuid references driving_sessions(id),
  points_earned numeric,
  token_amount numeric,
  status text not null default 'pending' check (status in ('pending', 'settled', 'failed')),
  stacks_tx_hash text,
  created_at timestamptz not null default now()
);

create index rewards_driver_id_idx on rewards (driver_id);
create index rewards_status_idx on rewards (status);
create index rewards_created_at_idx on rewards (created_at);

-- ---------------------------------------------------------------------------
-- Redemptions (airtime, fuel voucher, insurance discount, token withdrawal)
-- ---------------------------------------------------------------------------
create table redemptions (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid references profiles(id) on delete cascade,
  redemption_type text not null check (redemption_type in ('airtime', 'fuel_voucher', 'insurance_discount', 'token_withdrawal')),
  amount numeric,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index redemptions_driver_id_idx on redemptions (driver_id);

-- ---------------------------------------------------------------------------
-- Fleet-level aggregated reports (generated periodically, powers exports for insurers)
-- ---------------------------------------------------------------------------
create table fleet_reports (
  id uuid primary key default gen_random_uuid(),
  fleet_id uuid references fleets(id),
  period_start date,
  period_end date,
  avg_safety_score numeric,
  total_sessions int,
  total_critical_alerts int,
  generated_at timestamptz not null default now()
);

create index fleet_reports_fleet_id_idx on fleet_reports (fleet_id);
