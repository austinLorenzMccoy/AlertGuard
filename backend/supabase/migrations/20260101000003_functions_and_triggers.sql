-- AlertGuard database functions & triggers
-- PRD reference: Section 9 (Database Functions & Triggers)

-- ---------------------------------------------------------------------------
-- Auto-update `updated_at`
-- ---------------------------------------------------------------------------
create function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on public.profiles
  for each row execute procedure public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- Auto-compute safety score when a session completes
-- ---------------------------------------------------------------------------
create function public.compute_safety_score()
returns trigger as $$
declare
  critical_count int;
  vibration_count int;
  score numeric;
begin
  if new.status = 'completed' and old.status = 'active' then
    select count(*) filter (where severity = 'critical'),
           count(*) filter (where severity = 'vibration')
    into critical_count, vibration_count
    from drowsiness_events where session_id = new.id;

    score := greatest(0, 100 - (critical_count * 20) - (vibration_count * 5));
    update driving_sessions set safety_score = score where id = new.id;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger on_session_complete
  after update on public.driving_sessions
  for each row execute procedure public.compute_safety_score();
