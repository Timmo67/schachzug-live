-- Schachzug Live – initial schema
-- Principles: RLS on every table; entitlements written only by service role (Edge Functions / webhooks).

-- gen_random_uuid() is core in PG13+, no extension needed

-- ---------- Profiles ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 2 and 24),
  avatar_url    text,
  birth_year    int check (birth_year between 1900 and 2100),
  invite_code   text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  invited_by    uuid references public.profiles(id) on delete set null,
  parental_consent_at timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.profiles enable row level security;

-- ---------- Friendships ----------
create type public.friendship_status as enum ('pending', 'accepted', 'blocked');

create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status       public.friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.friendships enable row level security;

create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a))
  );
$$;

-- ---------- Games ----------
create type public.game_status as enum ('waiting', 'active', 'finished', 'aborted');

create table public.games (
  id             uuid primary key default gen_random_uuid(),
  white_id       uuid references public.profiles(id) on delete set null,
  black_id       uuid references public.profiles(id) on delete set null,
  status         public.game_status not null default 'waiting',
  time_control   text not null default '10+0',          -- e.g. '3+2', 'none'
  fen            text not null default 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves_uci      text[] not null default '{}',
  white_ms_left  int,
  black_ms_left  int,
  last_move_at   timestamptz,
  result         text check (result in ('1-0', '0-1', '1/2-1/2')),
  termination    text,                                   -- checkmate, resign, timeout, draw_agreed, ...
  draw_offer_by  uuid references public.profiles(id),
  created_at     timestamptz not null default now()
);
alter table public.games enable row level security;
create index games_white_idx on public.games(white_id);
create index games_black_idx on public.games(black_id);

-- ---------- Chat ----------
create table public.game_messages (
  id         bigint generated always as identity primary key,
  game_id    uuid not null references public.games(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 300),
  created_at timestamptz not null default now()
);
alter table public.game_messages enable row level security;

-- ---------- Entitlements (subscription state) ----------
create type public.plan as enum ('free', 'plus', 'pro', 'family', 'club');

create table public.entitlements (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  plan         public.plan not null default 'free',
  source       text not null default 'none',             -- none | stripe | revenuecat | referral_trial | family | club
  active_until timestamptz,
  will_renew   boolean not null default false,
  external_ref text,                                      -- stripe subscription id / revenuecat app_user_id
  updated_at   timestamptz not null default now()
);
alter table public.entitlements enable row level security;

create or replace function public.effective_plan(uid uuid)
returns public.plan language sql stable security definer set search_path = public as $$
  select coalesce(
    (select e.plan from public.entitlements e
      where e.user_id = uid and (e.active_until is null or e.active_until > now())),
    'free'::public.plan);
$$;

-- Video allowed in a game if at least one player has plus or higher
create or replace function public.game_has_video(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.games g
    where g.id = gid
      and (public.effective_plan(g.white_id) <> 'free' or public.effective_plan(g.black_id) <> 'free')
  );
$$;

-- ---------- Referrals ----------
create table public.referrals (
  id            bigint generated always as identity primary key,
  inviter_id    uuid not null references public.profiles(id) on delete cascade,
  invitee_id    uuid not null unique references public.profiles(id) on delete cascade,
  trial_ends_at timestamptz not null,
  converted_at  timestamptz,
  reward_granted_at timestamptz,
  created_at    timestamptz not null default now()
);
alter table public.referrals enable row level security;

-- ---------- Free video quota ----------
create table public.video_usage (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  seconds    int not null default 0,
  primary key (user_id, week_start)
);
alter table public.video_usage enable row level security;

-- ---------- Reports / blocking ----------
create table public.reports (
  id          bigint generated always as identity primary key,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  game_id     uuid references public.games(id) on delete set null,
  reason      text not null,
  created_at  timestamptz not null default now()
);
alter table public.reports enable row level security;

-- =================== RLS policies ===================
-- profiles: everyone signed in can read basic profiles; only owner updates own row
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_insert_self on public.profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- friendships: participants read; requester creates; addressee accepts; either side blocks/deletes
create policy friendships_read on public.friendships for select to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy friendships_request on public.friendships for insert to authenticated
  with check (requester_id = auth.uid() and status = 'pending');
create policy friendships_update on public.friendships for update to authenticated
  using (auth.uid() in (requester_id, addressee_id));
create policy friendships_delete on public.friendships for delete to authenticated
  using (auth.uid() in (requester_id, addressee_id));

-- games: players read; creation by a player; updates ONLY via Edge Function (service role) -> no update policy
create policy games_read on public.games for select to authenticated
  using (auth.uid() in (white_id, black_id));
create policy games_create on public.games for insert to authenticated
  with check (auth.uid() in (white_id, black_id) and status = 'waiting');

-- chat: players of the game read/write
create policy messages_read on public.game_messages for select to authenticated
  using (exists (select 1 from public.games g where g.id = game_id and auth.uid() in (g.white_id, g.black_id)));
create policy messages_write on public.game_messages for insert to authenticated
  with check (sender_id = auth.uid()
    and exists (select 1 from public.games g where g.id = game_id and auth.uid() in (g.white_id, g.black_id)));

-- entitlements: owner reads; no client writes
create policy entitlements_read_own on public.entitlements for select to authenticated using (user_id = auth.uid());

-- referrals: inviter and invitee read; no client writes
create policy referrals_read on public.referrals for select to authenticated
  using (auth.uid() in (inviter_id, invitee_id));

-- video usage: owner reads; no client writes
create policy video_usage_read on public.video_usage for select to authenticated using (user_id = auth.uid());

-- reports: reporter creates and reads own
create policy reports_create on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_read_own on public.reports for select to authenticated using (reporter_id = auth.uid());
