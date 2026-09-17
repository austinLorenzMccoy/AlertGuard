-- AlertGuard Row Level Security
-- PRD reference: Section 6 (Row Level Security)
--
-- Design notes / deviations from the PRD's illustrative snippet (documented per
-- the task's explicit instructions):
--
-- 1. RLS is enabled on EVERY table that holds user data, not just the four
--    tables shown in the PRD snippet (driving_sessions, drowsiness_events,
--    rewards, redemptions). profiles, fleets, devices, session_verifications
--    and fleet_reports all get RLS too.
--
-- 2. Two SECURITY DEFINER helper functions (public.current_role(),
--    public.current_fleet_id()) read the calling user's own profile row and
--    are used inside policies that would otherwise have `profiles` reference
--    itself (which risks "infinite recursion detected in policy for relation
--    profiles" in Postgres). They are STABLE and marked SECURITY DEFINER so
--    they bypass RLS internally for this one narrow lookup only.
--
-- 3. Fleet managers get INSERT/UPDATE policies where the PRD only showed
--    SELECT: they can create/update their own fleet, flag a session in their
--    fleet for dispute review (the schema's 'flagged' status otherwise has no
--    writer anywhere in the PRD), and assign an unassigned driver into their
--    fleet. Each is narrowly scoped and commented below.
--
-- 4. Admins are given NO row-level policies at all, per the PRD's closing
--    line in Section 6 ("Admins bypass RLS via a service-role key used only
--    in Edge Functions — never exposed to the client."). The Postgres
--    `service_role` used by Edge Functions has BYPASSRLS, so admin access is
--    enforced by "only Edge Functions carry the service-role key", not by SQL
--    policies naming role = 'admin'. This is intentional, not an omission.
--
-- 5. rewards and redemptions get NO client-facing INSERT/UPDATE policies at
--    all (not even for fleet_managers). These are financial ledgers that must
--    only ever be written by Edge Functions (calculate-reward, trigger-payout,
--    redeem-reward, the reconciliation job) under the service role, per the
--    Smart Contract PRD's invariant that "on-chain and off-chain state must
--    never silently diverge." Letting any client role write these columns
--    directly would break that invariant.
--
-- 6. A BEFORE UPDATE trigger (guard_session_status_transition) blocks a
--    driver from setting driving_sessions.status = 'verified' directly, and
--    from mutating a session that is already 'verified'. Without this, a
--    driver could call `.update({status:'verified'})` via the anon/authenticated
--    PostgREST role and self-award a reward-eligible status, since RLS alone
--    (USING/WITH CHECK) cannot compare OLD vs NEW status transitions. Only the
--    service role (used inside verify-session) may set status to 'verified'.
--    This directly targets the Step 3/Step 4 "adversarial test" callouts in
--    PRD Section 12.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create function public.current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create function public.current_fleet_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select fleet_id from public.profiles where id = auth.uid();
$$;

grant execute on function public.current_role() to authenticated;
grant execute on function public.current_fleet_id() to authenticated;

-- ---------------------------------------------------------------------------
-- Status-transition guard for driving_sessions (see note 6 above)
-- ---------------------------------------------------------------------------
create function public.guard_session_status_transition()
returns trigger as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'verified' and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'status can only be set to verified by the verification service';
    end if;
    if old.status = 'verified' and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'verified sessions are immutable to clients';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger guard_status_transition
  before update on public.driving_sessions
  for each row execute procedure public.guard_session_status_transition();

-- ---------------------------------------------------------------------------
-- Enable RLS on every table with user data
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.fleets enable row level security;
alter table public.devices enable row level security;
alter table public.driving_sessions enable row level security;
alter table public.drowsiness_events enable row level security;
alter table public.session_verifications enable row level security;
alter table public.rewards enable row level security;
alter table public.redemptions enable row level security;
alter table public.fleet_reports enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles_select_own"
  on public.profiles for select
  using (id = auth.uid());

create policy "profiles_select_fleet_manager_view_drivers"
  on public.profiles for select
  using (
    role = 'driver'
    and public.current_role() = 'fleet_manager'
    and fleet_id = public.current_fleet_id()
  );

-- Drivers may update their own profile, but never their own role or fleet_id
-- (that would be self-promotion / self-reassignment). Enforced by trigger
-- below rather than RLS, since RLS cannot compare OLD vs NEW columns.
create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create function public.guard_profile_self_escalation()
returns trigger as $$
begin
  if auth.uid() = old.id and coalesce(auth.role(), '') <> 'service_role' then
    if new.role is distinct from old.role then
      raise exception 'cannot change your own role';
    end if;
    if new.fleet_id is distinct from old.fleet_id then
      raise exception 'cannot change your own fleet assignment';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger guard_profile_escalation
  before update on public.profiles
  for each row execute procedure public.guard_profile_self_escalation();

-- Fleet managers may assign an unassigned driver into their own fleet, or
-- update a driver already in their fleet — but never change the driver's role
-- or move them to a different fleet than their own.
create policy "fleet_managers_assign_driver_to_fleet"
  on public.profiles for update
  using (
    role = 'driver'
    and public.current_role() = 'fleet_manager'
    and (fleet_id is null or fleet_id = public.current_fleet_id())
  )
  with check (
    role = 'driver'
    and fleet_id = public.current_fleet_id()
  );

-- No INSERT policy for profiles: rows are created exclusively by the
-- handle_new_user trigger (runs as SECURITY DEFINER / table owner).

-- ---------------------------------------------------------------------------
-- fleets
-- ---------------------------------------------------------------------------
create policy "fleets_select_member"
  on public.fleets for select
  using (id = public.current_fleet_id());

create policy "fleets_select_owner"
  on public.fleets for select
  using (owner_id = auth.uid());

create policy "fleets_insert_by_manager"
  on public.fleets for insert
  with check (owner_id = auth.uid() and public.current_role() = 'fleet_manager');

create policy "fleets_update_owner"
  on public.fleets for update
  using (owner_id = auth.uid() and public.current_role() = 'fleet_manager')
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- devices
-- ---------------------------------------------------------------------------
create policy "devices_select_own"
  on public.devices for select
  using (driver_id = auth.uid());

create policy "devices_select_fleet_manager"
  on public.devices for select
  using (
    public.current_role() = 'fleet_manager'
    and driver_id in (
      select id from public.profiles
      where fleet_id = public.current_fleet_id() and role = 'driver'
    )
  );

create policy "devices_insert_own"
  on public.devices for insert
  with check (driver_id = auth.uid());

create policy "devices_update_own"
  on public.devices for update
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

-- ---------------------------------------------------------------------------
-- driving_sessions
-- ---------------------------------------------------------------------------
create policy "drivers_own_sessions"
  on public.driving_sessions for select
  using (driver_id = auth.uid());

create policy "fleet_managers_view_fleet_sessions"
  on public.driving_sessions for select
  using (
    public.current_role() = 'fleet_manager'
    and fleet_id = public.current_fleet_id()
  );

create policy "drivers_insert_own_sessions"
  on public.driving_sessions for insert
  with check (driver_id = auth.uid());

-- Drivers can update their own sessions (e.g. end-of-trip: set end_time,
-- end_lat/lng, status 'active' -> 'completed'). They may NOT set status to
-- 'verified' (blocked by the guard_status_transition trigger) or touch
-- another driver's row (blocked by USING).
create policy "drivers_update_own_sessions"
  on public.driving_sessions for update
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

-- Fleet managers may flag a session in their fleet for dispute review. The
-- 'flagged' status has no other writer defined in the PRD.
create policy "fleet_managers_flag_fleet_sessions"
  on public.driving_sessions for update
  using (
    public.current_role() = 'fleet_manager'
    and fleet_id = public.current_fleet_id()
  )
  with check (
    fleet_id = public.current_fleet_id()
    and status in ('flagged', 'completed', 'verified', 'active')
  );

-- ---------------------------------------------------------------------------
-- drowsiness_events
-- ---------------------------------------------------------------------------
create policy "events_follow_session_visibility"
  on public.drowsiness_events for select
  using (
    session_id in (
      select id from public.driving_sessions
      where driver_id = auth.uid()
         or (public.current_role() = 'fleet_manager' and fleet_id = public.current_fleet_id())
    )
  );

-- Drivers may only log events against their own, still-active session — this
-- prevents fabricating events after the fact against a completed/verified
-- session to manipulate the safety score.
create policy "drivers_insert_own_session_events"
  on public.drowsiness_events for insert
  with check (
    session_id in (
      select id from public.driving_sessions
      where driver_id = auth.uid() and status = 'active'
    )
  );

-- No update/delete policy: drowsiness_events are an append-only audit trail.

-- ---------------------------------------------------------------------------
-- session_verifications
-- ---------------------------------------------------------------------------
create policy "session_verifications_follow_session_visibility"
  on public.session_verifications for select
  using (
    session_id in (
      select id from public.driving_sessions
      where driver_id = auth.uid()
         or (public.current_role() = 'fleet_manager' and fleet_id = public.current_fleet_id())
    )
  );

-- No insert/update policy: written exclusively by the verify-session Edge
-- Function via the service role.

-- ---------------------------------------------------------------------------
-- rewards
-- ---------------------------------------------------------------------------
create policy "drivers_own_rewards"
  on public.rewards for select
  using (driver_id = auth.uid());

create policy "fleet_managers_view_fleet_rewards"
  on public.rewards for select
  using (
    public.current_role() = 'fleet_manager'
    and session_id in (
      select id from public.driving_sessions where fleet_id = public.current_fleet_id()
    )
  );

-- No insert/update policy: written exclusively by calculate-reward /
-- trigger-payout / the reconciliation job via the service role (see note 5).

-- ---------------------------------------------------------------------------
-- redemptions
-- ---------------------------------------------------------------------------
create policy "drivers_own_redemptions"
  on public.redemptions for select
  using (driver_id = auth.uid());

-- No insert/update policy: written exclusively by redeem-reward via the
-- service role (see note 5). The driver-facing app calls the redeem-reward
-- Edge Function, which validates the caller's JWT itself, rather than
-- inserting into `redemptions` directly.

-- ---------------------------------------------------------------------------
-- fleet_reports
-- ---------------------------------------------------------------------------
create policy "fleet_managers_view_fleet_reports"
  on public.fleet_reports for select
  using (
    public.current_role() = 'fleet_manager'
    and fleet_id = public.current_fleet_id()
  );

-- No insert/update policy: written exclusively by generate-fleet-reports via
-- the service role.
