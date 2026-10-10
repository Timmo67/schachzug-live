-- M2: online games between friends.
-- Clients never write `games` directly: challenges, resign, draws and timeouts go through the
-- security-definer functions below; moves go through the Edge Function `make-move` (chess.js).

alter table public.games
  add column created_by   uuid references public.profiles(id) on delete set null,
  add column base_ms      int,            -- null = no clock
  add column increment_ms int not null default 0,
  add column version      int not null default 0,  -- optimistic lock, bumped on every change
  add column updated_at   timestamptz not null default now(),
  add column finished_at  timestamptz;

create index if not exists games_created_by_idx on public.games(created_by);

-- Direct inserts are no longer allowed; use create_game().
alter policy games_create on public.games with check (false);

-- Realtime: players receive row changes (RLS applies to postgres_changes).
alter publication supabase_realtime add table public.games, public.game_messages;

-- Remaining clock of the side to move, in ms, at time `at`. Clocks start after each side's first move.
create or replace function public.game_clock_left(g public.games, at timestamptz)
returns int language sql stable set search_path = public as $$
  select case
    when g.base_ms is null then null
    when cardinality(g.moves_uci) % 2 = 0 then
      g.white_ms_left - case when cardinality(g.moves_uci) >= 2 and g.last_move_at is not null
        then (extract(epoch from (at - g.last_move_at)) * 1000)::int else 0 end
    else
      g.black_ms_left - case when cardinality(g.moves_uci) >= 2 and g.last_move_at is not null
        then (extract(epoch from (at - g.last_move_at)) * 1000)::int else 0 end
  end;
$$;

create or replace function public.create_game(p_opponent uuid, p_time_control text, p_color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_base int;
  v_inc int;
  v_white uuid;
  v_black uuid;
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_opponent is null or p_opponent = v_me then raise exception 'invalid_opponent'; end if;
  if not public.are_friends(v_me, p_opponent) then raise exception 'not_friends'; end if;
  case p_time_control
    when '3+2' then v_base := 180000; v_inc := 2000;
    when '5+0' then v_base := 300000; v_inc := 0;
    when '10+0' then v_base := 600000; v_inc := 0;
    when '15+10' then v_base := 900000; v_inc := 10000;
    when 'none' then v_base := null; v_inc := 0;
    else raise exception 'invalid_time_control';
  end case;
  if p_color = 'random' then p_color := case when random() < 0.5 then 'w' else 'b' end; end if;
  if p_color = 'w' then v_white := v_me; v_black := p_opponent;
  elsif p_color = 'b' then v_white := p_opponent; v_black := v_me;
  else raise exception 'invalid_color';
  end if;
  insert into public.games (white_id, black_id, created_by, time_control, base_ms, increment_ms, white_ms_left, black_ms_left)
  values (v_white, v_black, v_me, p_time_control, v_base, v_inc, v_base, v_base)
  returning id into v_id;
  return v_id;
end;
$$;

-- Opponent accepts/declines a challenge; creator may cancel it.
create or replace function public.respond_game(p_game uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); g public.games;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into g from public.games where id = p_game for update;
  if g.id is null or v_me not in (g.white_id, g.black_id) then raise exception 'game_not_found'; end if;
  if g.status <> 'waiting' then raise exception 'game_not_waiting'; end if;
  if p_action = 'accept' and v_me <> g.created_by then
    update public.games set status = 'active', version = version + 1, updated_at = now() where id = p_game;
  elsif p_action = 'decline' and v_me <> g.created_by then
    update public.games set status = 'aborted', termination = 'declined', finished_at = now(),
      version = version + 1, updated_at = now() where id = p_game;
  elsif p_action = 'cancel' and v_me = g.created_by then
    update public.games set status = 'aborted', termination = 'cancelled', finished_at = now(),
      version = version + 1, updated_at = now() where id = p_game;
  else
    raise exception 'invalid_action';
  end if;
end;
$$;

-- Resign, offer/accept/decline a draw, or claim a win on time. Returns nothing; clients get the row via Realtime.
create or replace function public.game_action(p_game uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  g public.games;
  v_white_to_move boolean;
  v_left int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into g from public.games where id = p_game for update;
  if g.id is null or v_me not in (g.white_id, g.black_id) then raise exception 'game_not_found'; end if;
  if g.status <> 'active' then raise exception 'game_not_active'; end if;
  v_white_to_move := cardinality(g.moves_uci) % 2 = 0;

  -- A flag that has already fallen ends the game before any other action takes effect.
  v_left := public.game_clock_left(g, now());
  if v_left is not null and v_left <= 0 then
    update public.games set status = 'finished', termination = 'timeout',
      result = case when v_white_to_move then '0-1' else '1-0' end,
      white_ms_left = case when v_white_to_move then 0 else white_ms_left end,
      black_ms_left = case when v_white_to_move then black_ms_left else 0 end,
      draw_offer_by = null, finished_at = now(), version = version + 1, updated_at = now()
      where id = p_game;
    return;
  end if;

  if p_action = 'resign' then
    update public.games set status = 'finished', termination = 'resign',
      result = case when v_me = g.white_id then '0-1' else '1-0' end,
      draw_offer_by = null, finished_at = now(), version = version + 1, updated_at = now()
      where id = p_game;
  elsif p_action = 'offer_draw' then
    if g.draw_offer_by is not null then raise exception 'draw_already_offered'; end if;
    update public.games set draw_offer_by = v_me, version = version + 1, updated_at = now() where id = p_game;
  elsif p_action = 'accept_draw' then
    if g.draw_offer_by is null or g.draw_offer_by = v_me then raise exception 'no_draw_offer'; end if;
    update public.games set status = 'finished', termination = 'draw_agreed', result = '1/2-1/2',
      draw_offer_by = null, finished_at = now(), version = version + 1, updated_at = now()
      where id = p_game;
  elsif p_action = 'decline_draw' then
    if g.draw_offer_by is null or g.draw_offer_by = v_me then raise exception 'no_draw_offer'; end if;
    update public.games set draw_offer_by = null, version = version + 1, updated_at = now() where id = p_game;
  elsif p_action = 'claim_timeout' then
    raise exception 'no_timeout';
  else
    raise exception 'invalid_action';
  end if;
end;
$$;

revoke execute on function public.game_clock_left(public.games, timestamptz) from public, anon, authenticated;
revoke execute on function public.create_game(uuid, text, text) from public, anon;
revoke execute on function public.respond_game(uuid, text) from public, anon;
revoke execute on function public.game_action(uuid, text) from public, anon;
grant execute on function public.create_game(uuid, text, text) to authenticated;
grant execute on function public.respond_game(uuid, text) to authenticated;
grant execute on function public.game_action(uuid, text) to authenticated;
