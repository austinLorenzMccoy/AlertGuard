-- pgTAP: admin access is via service-role bypass only, never a client-facing
-- RLS policy naming role = 'admin'.
-- PRD reference: Section 6 closing line: "Admins bypass RLS via a
-- service-role key used only in Edge Functions — never exposed to the
-- client."

begin;
select plan(4);

-- ---------------------------------------------------------------------------
-- Static audit: no policy anywhere in the public schema should reference
-- role = 'admin' in its qualifier — admin access must never be granted via a
-- client-facing RLS policy, only via BYPASSRLS on the service_role Postgres
-- role.
-- ---------------------------------------------------------------------------
select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and (qual ilike '%''admin''%' or with_check ilike '%''admin''%')
  ),
  0,
  'no RLS policy in the public schema special-cases role = ''admin'''
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
insert into auth.users (id, phone) values ('f0000000-0000-0000-0000-000000000001', '+2340000000099')
on conflict (id) do nothing;

insert into public.driving_sessions (id, driver_id, start_time, status, distance_km)
values ('f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001', now(), 'active', 0);

-- ---------------------------------------------------------------------------
-- An authenticated user with an 'admin' role CLAIM on their JWT (e.g. a
-- forged/stale claim, or a profiles.role='admin' row with no dedicated
-- policy) gets NO special visibility beyond their own driver_id match —
-- proving admin visibility is not accidentally granted through RLS.
-- ---------------------------------------------------------------------------
update public.profiles set role = 'admin' where id = 'f0000000-0000-0000-0000-000000000001';

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.driving_sessions),
  1,
  'a profiles.role=''admin'' user only sees rows matching their own driver_id (own session), not a blanket "see everything"'
);

-- Insert a second driver's session (as postgres) and confirm the admin-role
-- profile still cannot see it under RLS.
reset role;
insert into auth.users (id, phone) values ('f0000000-0000-0000-0000-000000000003', '+2340000000098')
on conflict (id) do nothing;
insert into public.driving_sessions (id, driver_id, start_time, status, distance_km)
values ('f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003', now(), 'active', 0);

set local role authenticated;
set local request.jwt.claims = '{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated"}';

select is(
  (select count(*)::int from public.driving_sessions where id = 'f0000000-0000-0000-0000-000000000004'),
  0,
  'the admin-role profile still cannot see another driver''s session via RLS'
);

-- ---------------------------------------------------------------------------
-- The service_role Postgres role bypasses RLS entirely (BYPASSRLS), which is
-- how Edge Functions running as "admin" actually get full access.
-- ---------------------------------------------------------------------------
reset role;
select is(
  (select rolbypassrls from pg_roles where rolname = 'service_role'),
  true,
  'the service_role Postgres role has BYPASSRLS (admin access is via this, not an RLS policy)'
);

select * from finish();
rollback;
