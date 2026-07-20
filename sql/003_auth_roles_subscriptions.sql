-- ============================================================================
-- IRONMAP · 003 · auth roles, onboarding, subscriptions + app RLS policies
-- Makes the app functional: a role on every account, a profile auto-created on
-- signup, personal ($20) subscriptions, and the RLS policies for each flow
-- (personal / member / gym owner / platform admin). Applied to the "gym"
-- Supabase project 2026-07-18. Target: Postgres 16 + Supabase.
-- ============================================================================

alter table public.profiles
  add column if not exists role text not null default 'direct',
  add column if not exists onboarded boolean not null default false;
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('platform_admin','gym_owner','member','direct'));

-- Auto-provision a profile row whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name, role, onboarded)
  values (new.id,
          coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(new.email,'@',1)),
          'direct', false)
  on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Personal ($20/mo) direct-user subscriptions (no gym).
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'personal',
  price_usd numeric(6,2) not null default 20,
  status text not null default 'active',
  created_at timestamptz not null default now()
);
alter table public.user_subscriptions enable row level security;

-- ---- RLS policies for the app flows -------------------------------------
drop policy if exists own_select on public.profiles;
create policy own_select on public.profiles for select using (user_id = auth.uid());
drop policy if exists own_insert on public.profiles;
create policy own_insert on public.profiles for insert with check (user_id = auth.uid());
drop policy if exists own_update on public.profiles;
create policy own_update on public.profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists own_all on public.user_subscriptions;
create policy own_all on public.user_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists owner_all on public.orgs;
create policy owner_all on public.orgs for all using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

drop policy if exists owner_manage on public.gyms;
create policy owner_manage on public.gyms for all
  using (exists (select 1 from public.orgs o where o.id = gyms.org_id and o.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.orgs o where o.id = gyms.org_id and o.owner_user_id = auth.uid()));
drop policy if exists read_auth on public.gyms;
create policy read_auth on public.gyms for select to authenticated using (true);

drop policy if exists member_own on public.memberships;
create policy member_own on public.memberships for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists owner_read on public.memberships;
create policy owner_read on public.memberships for select using (
  exists (select 1 from public.gyms g join public.orgs o on o.id = g.org_id
          where g.id = memberships.gym_id and o.owner_user_id = auth.uid()));

drop policy if exists owner_sub on public.subscriptions;
create policy owner_sub on public.subscriptions for all
  using (exists (select 1 from public.orgs o where o.id = subscriptions.org_id and o.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.orgs o where o.id = subscriptions.org_id and o.owner_user_id = auth.uid()));

-- HQ aggregate stats — SECURITY DEFINER, returns COUNTS ONLY (no PII).
create or replace function public.hq_stats()
returns json language sql security definer set search_path = public stable as $$
  select json_build_object(
    'gyms', (select count(*) from public.gyms),
    'orgs', (select count(*) from public.orgs),
    'members', (select count(*) from public.memberships where status = 'active'),
    'direct_users', (select count(*) from public.user_subscriptions where status = 'active'),
    'mrr_usd',
      coalesce((select sum(price_usd) from public.user_subscriptions where status = 'active'), 0)
      + coalesce((select sum(case tier when 'starter' then 99 when 'growth' then 249 when 'pro' then 599 else 0 end)
                  from public.subscriptions where status in ('active','trialing')), 0)
  );
$$;
revoke execute on function public.hq_stats() from anon;
grant execute on function public.hq_stats() to authenticated;
