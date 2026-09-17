-- pgTAP: fleet_manager <-> fleet_manager isolation, and fleet_manager <-> driver visibility.
-- PRD reference: Section 6 (RLS), Section 12 Step 3 ("write test cases per
-- role (driver, fleet manager, admin) to confirm isolation").

begin;
select plan(9);

-- ---------------------------------------------------------------------------
-- Fixtures: two fleets, one manager + one driver each.
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone, email) values
  ('c0000000-0000-0000-0000-000000000001', null, 'manager1@test.local'),
  ('c0000000-0000-0000-0000-000000000002', null, 'manager2@test.local'),
  ('c0000000-0000-0000-0000-000000000003', '+2340000000010', null),
  ('c0000000-0000-0000-0000-000000000004', '+2340000000011', null)
on conflict (id) do nothing;

insert into public.fleets (id, name, owner_id) values
  ('d0000000-0000-0000-0000-000000000001', 'Fleet One', 'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'Fleet Two', 'c0000000-0000-0000-0000-000000000002');

-- Promote managers and assign drivers (as postgres, bypassing RLS/self-escalation guard).
update public.profiles set role = 'fleet_manager', fleet_id = 'd0000000-0000-0000-0000-000000000001' where id = 'c0000000-0000-0000-0000-000000000001';
update public.profiles set role = 'fleet_manager', fleet_id = 'd0000000-0000-0000-0000-000000000002' where id = 'c0000000-0000-0000-0000-000000000002';
update public.profiles set fleet_id = 'd0000000-0000-0000-0000-000000000001' where id = 'c0000000-0000-0000-0000-000000000003';
update public.profiles set fleet_id = 'd0000000-0000-0000-0000-000000000002' where id = 'c0000000-0000-0000-0000-000000000004';

insert into public.driving_sessions (id, driver_id, fleet_id, start_time, status, distance_km) values
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000001', now(), 'active', 0),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000002', now(), 'active', 0);

insert into public.fleet_reports (fleet_id, period_start, period_end, avg_safety_score, total_sessions, total_critical_alerts) values
  ('d0000000-0000-0000-0000-000000000001', '2026-01-05', '2026-01-11', 90, 5, 0),
  ('d0000000-0000-0000-0000-000000000002', '2026-01-05', '2026-01-11', 80, 3, 1);

-- ---------------------------------------------------------------------------
-- Impersonate fleet manager 1
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.driving_sessions),
  1,
  'fleet manager 1 sees only fleet one''s session'
);

select is(
  (select fleet_id from public.driving_sessions limit 1)::text,
  'd0000000-0000-0000-0000-000000000001',
  'the session fleet manager 1 sees belongs to fleet one'
);

select is(
  (select count(*)::int from public.profiles where role = 'driver'),
  1,
  'fleet manager 1 sees only fleet one''s driver profile'
);

select is(
  (select count(*)::int from public.fleet_reports),
  1,
  'fleet manager 1 sees only fleet one''s report'
);

select is(
  (select fleet_id from public.fleet_reports limit 1)::text,
  'd0000000-0000-0000-0000-000000000001',
  'the report fleet manager 1 sees is fleet one''s'
);

-- Fleet manager 1 may flag their own fleet's session.
update public.driving_sessions set status = 'flagged' where id = 'e0000000-0000-0000-0000-000000000001';
select is(
  (select status from public.driving_sessions where id = 'e0000000-0000-0000-0000-000000000001'),
  'flagged',
  'fleet manager 1 can flag a session in their own fleet'
);

-- Fleet manager 1 cannot flag fleet two's session (0 rows affected).
update public.driving_sessions set status = 'flagged' where id = 'e0000000-0000-0000-0000-000000000002';
select is(
  (select count(*)::int from public.driving_sessions where id = 'e0000000-0000-0000-0000-000000000002' and status = 'flagged'),
  0,
  'fleet manager 1 cannot flag fleet two''s session'
);

-- ---------------------------------------------------------------------------
-- Impersonate fleet manager 2, confirm symmetric isolation
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-000000000002","role":"authenticated"}';

select is(
  (select count(*)::int from public.driving_sessions),
  1,
  'fleet manager 2 sees only fleet two''s session'
);

select is(
  (select count(*)::int from public.fleet_reports),
  1,
  'fleet manager 2 sees only fleet two''s report'
);

select * from finish();
rollback;
