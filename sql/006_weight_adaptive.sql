-- ============================================================================
-- IRONMAP · 006 · weight-trend adaptive macros  (Phase 2)
-- weight_logs stores each weigh-in; the app reads the trend, re-estimates the
-- real energy balance, and auto-tunes the calorie target (MacroFactor-style).
--
-- NOTE: apply this when the Supabase management API is reachable again — it was
-- down when Phase 2 shipped, so the app falls back to localStorage for weights
-- until this runs. Once applied, weigh-ins sync cross-device.
--
-- The Phase-1/2 profile columns below were already applied live via MCP
-- (migrations profile_body_data + profile_meal_prefs); repeated here idempotently
-- for a clean rebuild from source.
-- ============================================================================

alter table public.profiles
  add column if not exists weight_kg     numeric,
  add column if not exists goal          text,
  add column if not exists days_per_week int,
  add column if not exists session_min   int,
  add column if not exists injuries      text,
  add column if not exists avatar_url    text,
  add column if not exists diet_mode     text,
  add column if not exists meal_prefs    jsonb not null default '{"liked":[],"disliked":[]}'::jsonb,
  add column if not exists adaptive_target int;

create table if not exists public.weight_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  weight_kg  numeric not null,
  logged_on  date not null default current_date,
  created_at timestamptz not null default now(),
  unique (user_id, logged_on)
);
alter table public.weight_logs enable row level security;
drop policy if exists own_all on public.weight_logs;
create policy own_all on public.weight_logs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Phase 3 (adaptive training) columns — applied live via MCP; repeated idempotently:
alter table public.profiles
  add column if not exists lift_state     jsonb not null default '{}'::jsonb,
  add column if not exists retune_cadence text,
  add column if not exists soreness       jsonb not null default '{}'::jsonb;
