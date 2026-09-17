-- AlertGuard local dev seed data.
-- PRD reference: Section 12 Step 3 ("Seed a test fleet + test drivers for
-- development"). Runs automatically on `supabase db reset` (see
-- supabase/config.toml [db.seed]).
--
-- This seed creates auth.users rows directly (local dev only — never do this
-- against a hosted project; use Supabase Auth's signup flow there), which
-- fires handle_new_user() and creates matching `profiles` rows automatically,
-- then promotes/assigns them as a fleet manager + fleet + two drivers.

do $$
declare
  manager_id uuid := '11111111-1111-1111-1111-111111111111';
  driver_one_id uuid := '22222222-2222-2222-2222-222222222222';
  driver_two_id uuid := '33333333-3333-3333-3333-333333333333';
  test_fleet_id uuid := '44444444-4444-4444-4444-444444444444';
begin
  -- Fleet manager (Google OAuth in production; seeded directly here).
  insert into auth.users (id, email, phone, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (
    manager_id, 'manager@lacoco-pilot.test', null, '', now(), now(), now(),
    '{"provider":"google","providers":["google"]}', '{}'
  )
  on conflict (id) do nothing;

  -- Drivers (Phone OTP in production; seeded directly here).
  insert into auth.users (id, email, phone, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values
    (driver_one_id, null, '+2348010000001', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}', '{}'),
    (driver_two_id, null, '+2348010000002', '', now(), now(), now(), '{"provider":"phone","providers":["phone"]}', '{}')
  on conflict (id) do nothing;

  -- handle_new_user() already created `profiles` rows with role='driver'.
  -- Promote the manager and finish wiring the fleet relationship.
  insert into public.fleets (id, name, owner_id)
  values (test_fleet_id, 'Lacoco Pilot Fleet', manager_id)
  on conflict (id) do nothing;

  update public.profiles
    set full_name = 'Pilot Fleet Manager', role = 'fleet_manager', fleet_id = test_fleet_id
    where id = manager_id;

  update public.profiles
    set full_name = 'Test Driver One', fleet_id = test_fleet_id,
        wallet_address = 'ST1TESTDRIVERONEXXXXXXXXXXXXXXXXXXXXXXXXX'
    where id = driver_one_id;

  update public.profiles
    set full_name = 'Test Driver Two', fleet_id = test_fleet_id,
        wallet_address = 'ST2TESTDRIVERTWOXXXXXXXXXXXXXXXXXXXXXXXXX'
    where id = driver_two_id;

  insert into public.devices (driver_id, device_model, os_version, app_version, device_attestation_key)
  values
    (driver_one_id, 'Tecno Spark 10', 'Android 13', '1.0.0', 'a1b2c3d4e5f60718293a4b5c6d7e8f90'),
    (driver_two_id, 'Infinix Hot 30', 'Android 13', '1.0.0', 'f0e9d8c7b6a5948372615049382716a0');
end $$;
