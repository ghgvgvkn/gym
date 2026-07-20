-- ============================================================================
-- IRONMAP · 002 · public schema (per-tenant data)
-- Orgs, gyms, members, physical machines, InBody scans, plans, logs, billing.
-- References the canonical gym.* rows. RLS enforces owner-only health data and
-- the owner/member privacy wall. Target: Postgres 16 + Supabase.
-- ============================================================================

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null, owner_user_id uuid not null references auth.users(id),
  plan_tier text not null default 'trial', member_cap int not null default 150,
  status text not null default 'active', created_at timestamptz not null default now()
);

create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs(id) on delete cascade,
  name text not null, city text, country text default 'JO',
  timezone text not null default 'Asia/Amman', join_code text unique not null,
  created_at timestamptz not null default now()
);

create table public.org_staff (
  org_id uuid not null references public.orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id uuid references public.gyms(id),
  role text not null check (role in ('owner','manager','staff')),
  primary key (org_id, user_id)
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null, locale text not null default 'ar',
  sex text check (sex in ('male','female')), birthdate date, height_cm numeric(5,1),
  created_at timestamptz not null default now()
);  -- NOTE: no email column. That lesson is already paid for.

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id uuid not null references public.gyms(id) on delete cascade,
  status text not null default 'active', joined_via text,
  started_at timestamptz not null default now(), ended_at timestamptz,
  unique (user_id, gym_id)
);

-- Physical machine units — reference the canonical gym.machine_types.
create table public.machines (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  machine_type_slug text references gym.machine_types(slug),
  label text not null, zone text, brand text, model text,
  photo_urls text[] not null default '{}', status text not null default 'active',
  recognition jsonb, confidence numeric(3,2), verified_by uuid references auth.users(id),
  image_embedding vector(512), created_at timestamptz not null default now()
);

create table public.inbody_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scanned_at date not null, source text not null default 'photo',
  weight_kg numeric(5,2) not null, skeletal_muscle_kg numeric(5,2), body_fat_pct numeric(4,1),
  bmr_kcal int, lbm_kg numeric(5,2), segmental jsonb, confirmed boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null, days_per_week int not null, minutes_per_session int not null,
  experience text not null, injuries text[] not null default '{}', active boolean not null default true
);

create table public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gym_id uuid not null references public.gyms(id), goal_id uuid references public.goals(id),
  inbody_scan_id uuid references public.inbody_scans(id),
  split_type text not null, weeks int not null default 6, engine_version text not null,
  rationale jsonb, status text not null default 'active'
);
create table public.workout_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  day_index int not null, focus text not null, est_minutes int not null
);
create table public.workout_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_slug text not null references gym.exercises(slug),
  machine_id uuid references public.machines(id),
  ord int not null, sets int not null, rep_low int not null, rep_high int not null,
  rest_sec int not null, alternatives text[] not null default '{}'
);
create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day_id uuid references public.workout_days(id),
  started_at timestamptz not null default now(), ended_at timestamptz,
  readiness jsonb, client_id text unique
);
create table public.set_logs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  item_id uuid references public.workout_items(id), set_no int not null,
  weight_kg numeric(6,2), reps int, rir int, pain_flag boolean not null default false,
  client_id text unique
);

create table public.meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null references gym.diet_modes(id),
  inbody_scan_id uuid references public.inbody_scans(id),
  kcal_target int not null, protein_g int not null, carbs_g int not null, fat_g int not null,
  ramadan_mode boolean not null default false, engine_version text not null,
  status text not null default 'active'
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid unique not null references public.orgs(id) on delete cascade,
  tier text not null, member_cap int not null, features jsonb not null,
  provider text not null, external_id text, current_period_end timestamptz,
  status text not null default 'trialing'
);

create table public.usage_meters (
  org_id uuid not null references public.orgs(id) on delete cascade,
  month date not null, active_members int not null default 0, cv_scans int not null default 0,
  assistant_msgs int not null default 0, voice_seconds int not null default 0,
  plans_generated int not null default 0, llm_cost_usd numeric(8,2) not null default 0,
  primary key (org_id, month)
);

create table public.safety_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  kind text not null, severity int not null, created_at timestamptz not null default now()
);

-- ---- RLS ---------------------------------------------------------------
-- Member-owned health data: owner-only both directions.
do $$
declare t text;
begin
  foreach t in array array[
    'inbody_scans','goals','workout_plans','workout_sessions','meal_plans'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy own_rows on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid());', t);
  end loop;
end $$;

-- set_logs has no user_id — ownership is transitive through its workout_session.
alter table public.set_logs enable row level security;
create policy own_rows on public.set_logs for all
  using (exists (select 1 from public.workout_sessions s where s.id = set_logs.session_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.workout_sessions s where s.id = set_logs.session_id and s.user_id = auth.uid()));

-- Members read the machine catalog of gyms they actively belong to.
alter table public.machines enable row level security;
create policy member_read on public.machines for select using (
  exists (select 1 from public.memberships m
          where m.gym_id = machines.gym_id and m.user_id = auth.uid() and m.status = 'active')
);
create policy staff_read on public.machines for select using (
  exists (select 1 from public.org_staff s join public.gyms g on g.org_id = s.org_id
          where g.id = machines.gym_id and s.user_id = auth.uid())
);
