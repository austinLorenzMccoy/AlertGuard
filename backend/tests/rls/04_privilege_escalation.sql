-- pgTAP: privilege-escalation adversarial tests.
-- PRD reference: Section 12 Step 3/4 "adversarial test" callouts, plus the
-- hardening documented in supabase/migrations/20260101000004_rls_policies.sql
-- (notes 3 and 6) that goes beyond the PRD's illustrative RLS snippet.

begin;
select plan(7);

insert into auth.users (id, phone) values
  ('11100000-0000-0000-0000-000000000001', '+2340000000201'),
  ('11100000-0000-0000-0000-000000000002', '+2340000000202')
on conflict (id) do nothing;

insert into public.driving_sessions (id, driver_id, start_time, end_time, status, distance_km)
values ('22200000-0000-0000-0000-000000000001', '11100000-0000-0000-0000-000000000001', now() - interval '1 hour', now(), 'completed', 5);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11100000-0000-0000-0000-000000000001","role":"authenticated"}';

-- 1. Driver cannot self-set their own completed session to 'verified'
--    (only the verify-session Edge Function, running as service_role, may).
select throws_ok(
  $$ update public.driving_sessions set status = 'verified' where id = '22200000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'driver cannot self-set status to verified'
);

-- 2. Driver cannot self-promote their own role to fleet_manager.
select throws_ok(
  $$ update public.profiles set role = 'fleet_manager' where id = '11100000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'driver cannot self-promote their own role'
);

-- 3. Driver cannot self-assign a fleet_id (fleet-jumping / privilege gain).
select throws_ok(
  $$ update public.profiles set fleet_id = '00000000-0000-0000-0000-000000000000' where id = '11100000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'driver cannot self-assign a fleet_id'
);

-- 4. Driver CAN update their own full_name (a legitimate self-update).
update public.profiles set full_name = 'Updated Name' where id = '11100000-0000-0000-0000-000000000001';
select is(
  (select full_name from public.profiles where id = '11100000-0000-0000-0000-000000000001'),
  'Updated Name',
  'driver can update their own non-privileged profile fields'
);

-- 5. Driver cannot insert a drowsiness_event against their own session once
--    it is no longer 'active' (post-hoc event fabrication after trip end).
select throws_ok(
  $$ insert into public.drowsiness_events (session_id, event_type, severity, occurred_at) values ('22200000-0000-0000-0000-000000000001', 'yawn', 'critical', now()) $$,
  null,
  null,
  'driver cannot insert a drowsiness_event against a non-active (completed) session'
);

-- ---------------------------------------------------------------------------
-- 6/7. Verify the service_role path IS allowed to do both of the above
-- (proving the guard trigger is role-scoped, not an absolute block).
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
-- auth.role() reads the JWT-claims session setting, not the Postgres session
-- role, so set it explicitly to mirror how PostgREST authenticates a
-- service-role Edge Function call.
set local request.jwt.claims = '{"role":"service_role"}';

update public.driving_sessions set status = 'verified' where id = '22200000-0000-0000-0000-000000000001';
select is(
  (select status from public.driving_sessions where id = '22200000-0000-0000-0000-000000000001'),
  'verified',
  'the service role (verify-session Edge Function) CAN set status to verified'
);

update public.profiles set role = 'fleet_manager' where id = '11100000-0000-0000-0000-000000000002';
select is(
  (select role from public.profiles where id = '11100000-0000-0000-0000-000000000002'),
  'fleet_manager',
  'the service role (admin action) CAN change a profile''s role'
);

select * from finish();
rollback;
