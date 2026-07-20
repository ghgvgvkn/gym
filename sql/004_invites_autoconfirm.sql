-- ============================================================================
-- IRONMAP · 004 · gym email-invites + auto-confirm signups
-- Applied to the "gym" Supabase project 2026-07-18.
--   · auto_confirm_user: new signups are confirmed at the DB level so the
--     email-click step is skipped. (Does NOT stop Supabase from SENDING the
--     confirmation email — the email rate limit is only removed by turning OFF
--     "Confirm email" in Authentication → Providers → Email.)
--   · gym_invites: a gym owner pre-registers member emails; a matching signup
--     auto-enrolls that user in the gym (no code needed).
-- ============================================================================

create or replace function public.auto_confirm_user()
returns trigger language plpgsql security definer set search_path = auth, public as $$
begin
  if new.email_confirmed_at is null then new.email_confirmed_at := now(); end if;
  return new;
end $$;
drop trigger if exists auto_confirm on auth.users;
create trigger auto_confirm before insert on auth.users
  for each row execute function public.auto_confirm_user();

create table if not exists public.gym_invites (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms(id) on delete cascade,
  email text not null,
  status text not null default 'invited',   -- invited | joined
  created_at timestamptz not null default now(),
  unique (gym_id, email)
);
create index if not exists gym_invites_email_idx on public.gym_invites (lower(email));
alter table public.gym_invites enable row level security;

drop policy if exists owner_manage on public.gym_invites;
create policy owner_manage on public.gym_invites for all
  using (exists (select 1 from public.gyms g join public.orgs o on o.id = g.org_id
                 where g.id = gym_invites.gym_id and o.owner_user_id = auth.uid()))
  with check (exists (select 1 from public.gyms g join public.orgs o on o.id = g.org_id
                 where g.id = gym_invites.gym_id and o.owner_user_id = auth.uid()));
drop policy if exists invitee_read on public.gym_invites;
create policy invitee_read on public.gym_invites for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));
drop policy if exists invitee_update on public.gym_invites;
create policy invitee_update on public.gym_invites for update to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')))
  with check (lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));
