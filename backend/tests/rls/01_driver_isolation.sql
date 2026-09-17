-- pgTAP: driver <-> driver isolation.
-- PRD reference: Section 6 (RLS), Section 12 Step 4 ("Confirm RLS blocks a
-- driver from writing to another driver's session (adversarial test)").
--
-- Run via: supabase start && pg_prove ... (see tests/rls/README.md).
-- Requires: `create extension if not exists pgtap;` in the target database.

begin;
select plan(10);

-- ---------------------------------------------------------------------------
-- Fixtures: two drivers, one fleet, one session each, created as the
-- postgres/service role (bypasses RLS) so setup itself isn't under test.
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone) values
  ('a0000000-0000-0000-0000-000000000001', '+2340000000001'),
  ('a0000000-0000-0000-0000-000000000002', '+2340000000002')
on conflict (id) do nothing;

-- handle_new_user() auto-creates the profiles rows with role='driver'.

insert into public.driving_sessions (id, driver_id, start_time, status, distance_km)
values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', now(), 'active', 0),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', now(), 'active', 0);

insert into public.drowsiness_events (session_id, event_type, severity, occurred_at)
values ('b0000000-0000-0000-0000-000000000001', 'yawn', 'soft', now());

insert into public.rewards (driver_id, session_id, points_earned, token_amount, status)
values ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 10, 0.1, 'settled');

-- ---------------------------------------------------------------------------
-- Impersonate driver 1
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.driving_sessions),
  1,
  'driver 1 sees only their own driving_sessions row'
);

select is(
  (select driver_id from public.driving_sessions limit 1)::text,
  'a0000000-0000-0000-0000-000000000001',
  'the one session driver 1 sees is their own'
);

select is(
  (select count(*)::int from public.rewards),
  1,
  'driver 1 sees only their own reward'
);

select throws_ok(
  $$ update public.driving_sessions set status = 'verified' where id = 'b0000000-0000-0000-0000-000000000001' $$,
  null,
  null,
  'driver 1 cannot self-set their own session to verified (guard_status_transition trigger)'
);

select is(
  (select count(*)::int from public.driving_sessions where id = 'b0000000-0000-0000-0000-000000000002'),
  0,
  'driver 1 cannot see driver 2''s session row at all'
);

-- Attempting to update driver 2's session (adversarial write) must affect 0 rows.
update public.driving_sessions set distance_km = 999 where id = 'b0000000-0000-0000-0000-000000000002';
select is(
  (select distance_km from public.driving_sessions where id = 'b0000000-0000-0000-0000-000000000002' and driver_id = 'a0000000-0000-0000-0000-000000000002'),
  null,
  'driver 1''s update to driver 2''s session silently affects 0 rows (RLS USING clause), value unchanged'
);

-- Driver 1 cannot insert a session claiming to be driver 2.
select throws_ok(
  $$ insert into public.driving_sessions (driver_id, start_time, status) values ('a0000000-0000-0000-0000-000000000002', now(), 'active') $$,
  null,
  null,
  'driver 1 cannot insert a driving_sessions row with another driver_id'
);

-- Driver 1 cannot insert a drowsiness_event against driver 2's session.
select throws_ok(
  $$ insert into public.drowsiness_events (session_id, event_type, severity, occurred_at) values ('b0000000-0000-0000-0000-000000000002', 'yawn', 'soft', now()) $$,
  null,
  null,
  'driver 1 cannot insert a drowsiness_event against driver 2''s session'
);

-- ---------------------------------------------------------------------------
-- Impersonate driver 2, confirm symmetric isolation
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.driving_sessions),
  1,
  'driver 2 sees only their own driving_sessions row'
);

select is(
  (select count(*)::int from public.drowsiness_events),
  0,
  'driver 2 cannot see driver 1''s drowsiness_events (their own session has none)'
);

select * from finish();
rollback;
