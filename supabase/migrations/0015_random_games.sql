-- Random opponents (free for everyone), with protection: no video and only fixed chat phrases between
-- strangers, blocking (existing respond_friend 'block'), reports with an automatic exclusion from random
-- games after 3 reporters, and a small moderation area for admins.

-- ---------- Columns ----------
alter table public.games add column kind text not null default 'friend' check (kind in ('friend', 'random'));

alter table public.profiles
  add column random_rating int not null default 1200,
  add column random_games int not null default 0,
  add column random_banned boolean not null default false,
  add column is_admin boolean not null default false;

-- Users may not change server-managed profile fields (adds the new columns to 0009's list). Checks the
-- database role instead of the JWT role, so security-definer functions (ratings, reports, moderation)
-- running on behalf of a signed-in user can still update them.
create or replace function public.protect_profile_flags()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.beta_tester := old.beta_tester;
    new.adult_confirmed_at := old.adult_confirmed_at;
    new.terms_accepted_at := old.terms_accepted_at;
    new.invite_code := old.invite_code;
    new.random_rating := old.random_rating;
    new.random_games := old.random_games;
    new.random_banned := old.random_banned;
    new.is_admin := old.is_admin;
  end if;
  return new;
end;
$$;

alter table public.reports
  add column details text check (char_length(details) <= 500),
  add column status text not null default 'open' check (status in ('open', 'dismissed', 'actioned')),
  add column resolved_at timestamptz;
-- Reports are created only through report_user (checks + automatic exclusion).
alter policy reports_create on public.reports with check (false);

-- ---------- Helpers ----------
-- Blocking is a friendships row with status 'blocked' (respond_friend 'block'); either direction counts.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friendships f where f.status = 'blocked'
    and ((f.requester_id = a and f.addressee_id = b) or (f.requester_id = b and f.addressee_id = a)));
$$;
revoke execute on function public.is_blocked(uuid, uuid) from public, anon, authenticated;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- Strangers in a random game get no video; it opens up once they are friends.
create or replace function public.game_has_video(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.games g
    where g.id = gid
      and (g.kind = 'friend' or public.are_friends(g.white_id, g.black_id))
      and (public.effective_plan(g.white_id) <> 'free' or public.effective_plan(g.black_id) <> 'free')
  );
$$;

create or replace function public.is_video_topic_player(p_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_topic like 'video:%' and exists (
    select 1 from public.games g
    where g.id::text = split_part(p_topic, ':', 2) and (select auth.uid()) in (g.white_id, g.black_id)
      and (g.kind = 'friend' or public.are_friends(g.white_id, g.black_id))
  );
$$;

-- Video status: never for strangers in a random game (not even the free minutes).
create or replace function public.video_status(p_game uuid)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_used int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.games g where g.id = p_game and v_me in (g.white_id, g.black_id)) then
    raise exception 'game_not_found';
  end if;
  if exists (select 1 from public.games g where g.id = p_game and g.kind = 'random'
             and not public.are_friends(g.white_id, g.black_id)) then
    return json_build_object('allowed', false, 'unlimited', false, 'remaining_seconds', 0, 'strangers', true);
  end if;
  if public.game_has_video(p_game) then
    return json_build_object('allowed', true, 'unlimited', true, 'remaining_seconds', null);
  end if;
  select coalesce(seconds, 0) into v_used from public.video_usage
    where user_id = v_me and week_start = public.video_week_start();
  v_used := coalesce(v_used, 0);
  return json_build_object('allowed', v_used < public.video_free_seconds(), 'unlimited', false,
    'remaining_seconds', greatest(0, public.video_free_seconds() - v_used));
end;
$$;

-- ---------- Chat between strangers: fixed phrases only ----------
create or replace function public.chat_phrases() returns text[] language sql immutable set search_path = public as $$
  select array['Hallo!', 'Viel Glück!', 'Guter Zug!', 'Ups!', 'Gutes Spiel!', 'Danke!', 'Revanche?']
$$;

create or replace function public.check_stranger_chat()
returns trigger language plpgsql security definer set search_path = public as $$
declare g public.games;
begin
  select * into g from public.games where id = new.game_id;
  if g.kind = 'random' and not public.are_friends(g.white_id, g.black_id) and not (new.body = any (public.chat_phrases())) then
    raise exception 'chat_phrases_only';
  end if;
  return new;
end;
$$;
revoke execute on function public.check_stranger_chat() from public, anon, authenticated;
create trigger game_messages_stranger_chat before insert on public.game_messages
  for each row execute function public.check_stranger_chat();

-- ---------- Matchmaking ----------
create table public.match_queue (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  time_control text not null,
  rating       int not null,
  status       text not null default 'waiting' check (status in ('waiting', 'matched', 'consumed', 'cancelled')),
  game_id      uuid references public.games(id) on delete set null,
  joined_at    timestamptz not null default now(),
  seen_at      timestamptz not null default now()
);
alter table public.match_queue enable row level security;
create policy match_queue_none on public.match_queue for all to anon, authenticated using (false) with check (false);
create index match_queue_waiting_idx on public.match_queue(time_control, status, seen_at);
create index match_queue_game_idx on public.match_queue(game_id);

-- Called every few seconds while searching. Joins (or stays in) the queue and pairs with a waiting player
-- of similar rating; the allowed rating gap grows the longer one waits. Returns {game_id} or {waiting}.
create or replace function public.find_match(p_time_control text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  me public.profiles;
  q public.match_queue;
  opp public.match_queue;
  v_base int;
  v_inc int;
  v_window int;
  v_white uuid;
  v_black uuid;
  v_game uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into me from public.profiles where id = v_me;
  if me.random_banned then raise exception 'random_banned'; end if;
  case p_time_control
    when '3+2' then v_base := 180000; v_inc := 2000;
    when '5+0' then v_base := 300000; v_inc := 0;
    when '10+0' then v_base := 600000; v_inc := 0;
    when '15+10' then v_base := 900000; v_inc := 10000;
    else raise exception 'invalid_time_control';
  end case;

  select * into q from public.match_queue where user_id = v_me for update;
  if q.user_id is not null and q.status = 'matched' and q.game_id is not null then
    update public.match_queue set status = 'consumed' where user_id = v_me;
    return json_build_object('game_id', q.game_id);
  end if;
  if q.user_id is null then
    insert into public.match_queue (user_id, time_control, rating) values (v_me, p_time_control, me.random_rating)
      returning * into q;
  elsif q.status <> 'waiting' or q.time_control <> p_time_control or q.seen_at < now() - interval '15 seconds' then
    update public.match_queue set time_control = p_time_control, rating = me.random_rating, status = 'waiting',
      game_id = null, joined_at = now(), seen_at = now() where user_id = v_me returning * into q;
  else
    update public.match_queue set seen_at = now() where user_id = v_me returning * into q;
  end if;

  v_window := least(1000, 100 + 15 * extract(epoch from (now() - q.joined_at))::int);
  select * into opp from public.match_queue o
    where o.status = 'waiting' and o.time_control = p_time_control and o.user_id <> v_me
      and o.seen_at > now() - interval '8 seconds'
      and abs(o.rating - q.rating) <= v_window
      and not public.is_blocked(v_me, o.user_id)
      and not exists (select 1 from public.profiles p where p.id = o.user_id and p.random_banned)
    order by o.joined_at
    limit 1
    for update skip locked;
  if opp.user_id is null then
    return json_build_object('waiting', true, 'window', v_window, 'rating', q.rating);
  end if;

  if random() < 0.5 then v_white := v_me; v_black := opp.user_id; else v_white := opp.user_id; v_black := v_me; end if;
  insert into public.games (white_id, black_id, created_by, time_control, base_ms, increment_ms, white_ms_left, black_ms_left, status, kind)
    values (v_white, v_black, v_me, p_time_control, v_base, v_inc, v_base, v_base, 'active', 'random')
    returning id into v_game;
  update public.match_queue set status = 'matched', game_id = v_game where user_id = opp.user_id;
  update public.match_queue set status = 'consumed', game_id = v_game where user_id = v_me;
  return json_build_object('game_id', v_game);
end;
$$;

create or replace function public.cancel_match()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.match_queue set status = 'cancelled' where user_id = auth.uid() and status = 'waiting';
end;
$$;

-- A random game where a side does not make its first move within 30 seconds is called off (no rating).
create or replace function public.abort_random_game(p_game uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); g public.games;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into g from public.games where id = p_game for update;
  if g.id is null or v_me not in (g.white_id, g.black_id) then raise exception 'game_not_found'; end if;
  if g.kind <> 'random' or g.status <> 'active' or cardinality(g.moves_uci) >= 2 then raise exception 'cannot_abort'; end if;
  if coalesce(g.last_move_at, g.created_at) > now() - interval '30 seconds' then raise exception 'too_early'; end if;
  update public.games set status = 'aborted', termination = 'no_first_move', finished_at = now(),
    version = version + 1, updated_at = now() where id = p_game;
end;
$$;

-- Rematch after a random game: a new challenge to the same player, colours swapped.
create or replace function public.rematch_random(p_game uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); g public.games; v_opp uuid; v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into g from public.games where id = p_game;
  if g.id is null or v_me not in (g.white_id, g.black_id) or g.kind <> 'random' or g.status <> 'finished' then
    raise exception 'game_not_found';
  end if;
  v_opp := case when g.white_id = v_me then g.black_id else g.white_id end;
  if v_opp is null or public.is_blocked(v_me, v_opp) then raise exception 'not_possible'; end if;
  if exists (select 1 from public.profiles where id in (v_me, v_opp) and random_banned) then raise exception 'not_possible'; end if;
  insert into public.games (white_id, black_id, created_by, time_control, base_ms, increment_ms, white_ms_left, black_ms_left, kind)
    values (g.black_id, g.white_id, v_me, g.time_control, g.base_ms, g.increment_ms, g.base_ms, g.base_ms, 'random')
    returning id into v_id;
  return v_id;
end;
$$;

-- ---------- Rating for random games (Elo) ----------
create or replace function public.rate_random_game()
returns trigger language plpgsql security definer set search_path = public as $$
declare w public.profiles; b public.profiles; v_score float8; v_exp float8; v_kw int; v_kb int;
begin
  if new.kind <> 'random' or new.status <> 'finished' or old.status = 'finished' or new.result is null
     or new.white_id is null or new.black_id is null then
    return new;
  end if;
  select * into w from public.profiles where id = new.white_id;
  select * into b from public.profiles where id = new.black_id;
  v_score := case new.result when '1-0' then 1 when '0-1' then 0 else 0.5 end;
  v_exp := 1 / (1 + power(10, (b.random_rating - w.random_rating) / 400.0));
  v_kw := case when w.random_games < 20 then 40 else 20 end;
  v_kb := case when b.random_games < 20 then 40 else 20 end;
  update public.profiles set random_rating = greatest(100, random_rating + round(v_kw * (v_score - v_exp))::int),
    random_games = random_games + 1 where id = w.id;
  update public.profiles set random_rating = greatest(100, random_rating + round(v_kb * ((1 - v_score) - (1 - v_exp)))::int),
    random_games = random_games + 1 where id = b.id;
  return new;
end;
$$;
revoke execute on function public.rate_random_game() from public, anon, authenticated;
create trigger games_rate_random after update of status on public.games
  for each row execute function public.rate_random_game();

-- ---------- Reports ----------
-- Report a player you played against. Three different reporters with open reports exclude the player
-- from random games until an admin looks at it.
create or replace function public.report_user(p_user uuid, p_game uuid, p_reason text, p_details text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_reporters int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_user = v_me then raise exception 'invalid_report'; end if;
  if p_reason not in ('name', 'cheating', 'behaviour', 'other') then raise exception 'invalid_report'; end if;
  if not exists (select 1 from public.games g where g.id = p_game
                 and ((g.white_id = v_me and g.black_id = p_user) or (g.black_id = v_me and g.white_id = p_user))) then
    raise exception 'invalid_report';
  end if;
  if exists (select 1 from public.reports where reporter_id = v_me and reported_id = p_user and status = 'open') then
    raise exception 'already_reported';
  end if;
  insert into public.reports (reporter_id, reported_id, game_id, reason, details)
    values (v_me, p_user, p_game, p_reason, nullif(left(trim(coalesce(p_details, '')), 500), ''));
  select count(distinct reporter_id) into v_reporters from public.reports where reported_id = p_user and status = 'open';
  if v_reporters >= 3 then
    update public.profiles set random_banned = true where id = p_user;
  end if;
end;
$$;

-- ---------- Moderation (admins only) ----------
create or replace function public.admin_reports()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(r order by r.created_at desc) from (
    select rp.id, rp.reason, rp.details, rp.status, rp.created_at, rp.game_id,
           rp.reported_id, pd.display_name as reported_name, pd.random_banned,
           rp.reporter_id, pr.display_name as reporter_name,
           (select count(distinct x.reporter_id) from public.reports x where x.reported_id = rp.reported_id and x.status = 'open') as open_reporters
    from public.reports rp
    left join public.profiles pd on pd.id = rp.reported_id
    left join public.profiles pr on pr.id = rp.reporter_id
    where rp.status = 'open' or rp.created_at > now() - interval '30 days'
    limit 200) r), '[]'::json);
end;
$$;

-- dismiss: report unfounded · ban: exclude from random games for good · unban: allow again (closes open reports)
create or replace function public.admin_resolve(p_user uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_action = 'dismiss' or p_action = 'unban' then
    update public.reports set status = 'dismissed', resolved_at = now() where reported_id = p_user and status = 'open';
    update public.profiles set random_banned = false where id = p_user;
  elsif p_action = 'ban' then
    update public.reports set status = 'actioned', resolved_at = now() where reported_id = p_user and status = 'open';
    update public.profiles set random_banned = true where id = p_user;
  else
    raise exception 'invalid_action';
  end if;
end;
$$;

create or replace function public.admin_feedback()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  return coalesce((select json_agg(f order by f.created_at desc) from (
    select fb.id, fb.body, fb.page, fb.user_agent, fb.created_at, p.display_name
    from public.feedback fb left join public.profiles p on p.id = fb.user_id
    order by fb.created_at desc limit 200) f), '[]'::json);
end;
$$;

revoke execute on function public.find_match(text) from public, anon;
revoke execute on function public.cancel_match() from public, anon;
revoke execute on function public.abort_random_game(uuid) from public, anon;
revoke execute on function public.rematch_random(uuid) from public, anon;
revoke execute on function public.report_user(uuid, uuid, text, text) from public, anon;
revoke execute on function public.admin_reports() from public, anon;
revoke execute on function public.admin_resolve(uuid, text) from public, anon;
revoke execute on function public.admin_feedback() from public, anon;
grant execute on function public.find_match(text) to authenticated;
grant execute on function public.cancel_match() to authenticated;
grant execute on function public.abort_random_game(uuid) to authenticated;
grant execute on function public.rematch_random(uuid) to authenticated;
grant execute on function public.report_user(uuid, uuid, text, text) to authenticated;
grant execute on function public.admin_reports() to authenticated;
grant execute on function public.admin_resolve(uuid, text) to authenticated;
grant execute on function public.admin_feedback() to authenticated;
