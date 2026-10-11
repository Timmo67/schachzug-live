-- Closed beta (free, 18+): new accounts need a valid invite code and must confirm they are adults and
-- accept the beta terms. Every beta account gets Plus for free (source 'beta') and is marked as beta
-- tester, so the launch offer (6 months Plus) can be granted to exactly these people later.
--
-- Admin bypass (for tests and manual accounts): a one-time token from `beta_admin_tokens`, which only the
-- service role can write (RLS denies all clients), passed as user_metadata.beta_token.

create table public.beta_admin_tokens (
  token      text primary key,
  created_at timestamptz not null default now()
);
alter table public.beta_admin_tokens enable row level security;
create policy beta_admin_tokens_none on public.beta_admin_tokens for all to anon, authenticated using (false) with check (false);
comment on table public.beta_admin_tokens is 'One-time tokens to create accounts without invite (service role only; clients denied by RLS).';

alter table public.profiles
  add column beta_tester boolean not null default false,
  add column adult_confirmed_at timestamptz,
  add column terms_accepted_at timestamptz;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name   text := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'Spieler');
  v_code   text := upper(trim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
  v_admin  boolean := false;
  v_adult  boolean := coalesce((new.raw_user_meta_data->>'adult_confirmed')::boolean, false);
  v_terms  boolean := coalesce((new.raw_user_meta_data->>'terms_accepted')::boolean, false);
begin
  delete from public.beta_admin_tokens where token = new.raw_user_meta_data->>'beta_token' returning true into v_admin;
  v_admin := coalesce(v_admin, false);
  if not v_admin then
    if not exists (select 1 from public.profiles where invite_code = v_code) then
      raise exception 'beta_invite_required';
    end if;
    if not v_adult or not v_terms then
      raise exception 'beta_terms_required';
    end if;
  end if;
  if char_length(v_name) < 2 then v_name := v_name || '_'; end if;
  insert into public.profiles (id, display_name, beta_tester, adult_confirmed_at, terms_accepted_at)
  values (new.id, left(v_name, 24), true,
          case when v_adult then now() end, case when v_terms then now() end);
  insert into public.entitlements (user_id, plan, source) values (new.id, 'plus', 'beta');
  return new;
end;
$$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Everyone who already has an account is a beta tester with free Plus too.
update public.profiles set beta_tester = true;
update public.entitlements set plan = 'plus', source = 'beta', active_until = null, will_renew = false
  where plan = 'free' or (active_until is not null and active_until < now()) or source = 'referral_trial';

-- Users may edit their own profile, but not these server-managed fields.
create or replace function public.protect_profile_flags()
returns trigger language plpgsql set search_path = public as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    new.beta_tester := old.beta_tester;
    new.adult_confirmed_at := old.adult_confirmed_at;
    new.terms_accepted_at := old.terms_accepted_at;
    new.invite_code := old.invite_code;
  end if;
  return new;
end;
$$;
revoke execute on function public.protect_profile_flags() from public, anon, authenticated;

create trigger profiles_protect_flags
  before update on public.profiles
  for each row execute function public.protect_profile_flags();
