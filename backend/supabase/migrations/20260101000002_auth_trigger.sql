-- AlertGuard auth wiring
-- PRD reference: Section 5 (Authentication)
--
-- 1. handle_new_user(): auto-creates a `profiles` row when a new auth.users row
--    is inserted (phone OTP signup or Google OAuth signup both land here).
-- 2. custom_access_token_hook(): a Supabase Auth Hook (configured in
--    supabase/config.toml under [auth.hook.custom_access_token]) that copies
--    `role` and `fleet_id` from `profiles` onto the issued JWT as custom claims,
--    so Edge Functions and PostgREST/RLS can read them without an extra query.

create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, phone, role)
  values (
    new.id,
    new.phone,
    -- Google OAuth signups (fleet managers/admins) never have a phone number;
    -- phone OTP signups (drivers) always do. Default new signups to 'driver'
    -- per the PRD sketch; fleet_manager/admin roles are promoted by an admin
    -- via the service role after account creation.
    'driver'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Custom access token hook: syncs profiles.role / profiles.fleet_id into the
-- JWT's custom claims so RLS policies and Edge Functions can trust
-- auth.jwt() -> 'role' / auth.jwt() -> 'fleet_id' without a round-trip query.
--
-- Wire this up as a Postgres Auth Hook:
--   supabase/config.toml:
--     [auth.hook.custom_access_token]
--     enabled = true
--     uri = "pg-functions://postgres/public/custom_access_token_hook"
-- ---------------------------------------------------------------------------
create function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  user_role text;
  user_fleet_id uuid;
begin
  select role, fleet_id
    into user_role, user_fleet_id
    from public.profiles
    where id = (event ->> 'user_id')::uuid;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if user_role is not null then
    claims := jsonb_set(claims, '{role}', to_jsonb(user_role));
  end if;

  if user_fleet_id is not null then
    claims := jsonb_set(claims, '{fleet_id}', to_jsonb(user_fleet_id::text));
  end if;

  event := jsonb_set(event, '{claims}', claims);
  return event;
end;
$$;

-- The auth hook is invoked by the Supabase Auth service (not by client roles),
-- so grant execute to supabase_auth_admin only.
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

grant usage on schema public to supabase_auth_admin;
grant select on public.profiles to supabase_auth_admin;
