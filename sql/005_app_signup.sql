-- ============================================================================
-- IRONMAP · 005 · email-free signup  (applied to "gym" Supabase 2026-07-18)
-- Creates accounts directly in auth.users/auth.identities with a bcrypt password
-- and a pre-confirmed email — so NO confirmation email is sent, which means no
-- "email rate limit exceeded" and no email-click step. The app calls this RPC,
-- then signInWithPassword. (Standard Supabase signUp still works if you prefer
-- to re-enable it after turning off "Confirm email".)
--
-- The empty-string token columns are REQUIRED: GoTrue (Go) 500s trying to scan
-- NULL into its non-nullable string fields, so they must be '' not NULL.
-- ============================================================================

create or replace function public.app_signup(p_email text, p_password text)
returns json language plpgsql security definer set search_path = auth, public, extensions as $$
declare uid uuid := gen_random_uuid(); e text := lower(trim(p_email));
begin
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return json_build_object('error','invalid_email'); end if;
  if length(p_password) < 6 then return json_build_object('error','weak_password'); end if;
  if exists (select 1 from auth.users where email = e) then return json_build_object('error','already_registered'); end if;

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', e,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false,
    '', '', '', '', '', '', '', '');

  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (uid::text, uid, json_build_object('sub', uid::text, 'email', e)::jsonb, 'email', now(), now(), now());

  return json_build_object('ok', true);  -- profile auto-created by the handle_new_user trigger
end $$;

revoke execute on function public.app_signup(text,text) from public;
grant execute on function public.app_signup(text,text) to anon, authenticated;
