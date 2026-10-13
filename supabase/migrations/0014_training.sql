-- Personal training (Plus) and one free puzzle per day.
-- Training unlocks after 10 finished games; the weakness profile is computed in the browser from the
-- player's game analyses and puzzle results, lessons are puzzles filtered by motif.

-- Free players: one puzzle per day as a taste of Plus.
create or replace function public.puzzle_free_per_day() returns int language sql immutable set search_path = public as $$ select 1 $$;

-- Shared by next_puzzle and next_training_puzzle. An unanswered puzzle is always handed out again
-- first (no skipping hard ones); otherwise a new one near the player's rating, optionally with one of
-- the given motifs.
create or replace function public.pick_puzzle(p_user uuid, p_themes text[])
returns json language plpgsql security definer set search_path = public as $$
declare
  v_rating int;
  v_today int;
  p public.puzzles;
  v_width int := 100;
begin
  select pz.* into p from public.puzzle_attempts a join public.puzzles pz on pz.id = a.puzzle_id
    where a.user_id = p_user and a.solved is null order by a.created_at desc limit 1;
  if p.id is null then
    if public.effective_plan(p_user) = 'free' then
      if p_themes is not null then raise exception 'training_requires_plus'; end if;
      select count(*) into v_today from public.puzzle_attempts
        where user_id = p_user and created_at >= date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
      if v_today >= public.puzzle_free_per_day() then raise exception 'puzzle_requires_plus'; end if;
    end if;
    select coalesce((select rating from public.puzzle_stats where user_id = p_user), 1200) into v_rating;
    while p.id is null and v_width <= 3200 loop
      select pz.* into p from public.puzzles pz
        where pz.rating between v_rating - v_width and v_rating + v_width
          and (p_themes is null or pz.themes && p_themes)
          and not exists (select 1 from public.puzzle_attempts a where a.user_id = p_user and a.puzzle_id = pz.id)
        order by random() limit 1;
      v_width := v_width * 2;
    end loop;
    if p.id is null then raise exception 'no_puzzles_left'; end if;
    insert into public.puzzle_attempts (user_id, puzzle_id) values (p_user, p.id);
  end if;
  return json_build_object('id', p.id, 'fen', p.fen, 'moves', p.moves, 'rating', p.rating, 'themes', p.themes);
end;
$$;
revoke execute on function public.pick_puzzle(uuid, text[]) from public, anon, authenticated;

create or replace function public.next_puzzle()
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return public.pick_puzzle(auth.uid(), null);
end;
$$;

-- A puzzle for a training lesson: one of the given motifs (Plus).
create or replace function public.next_training_puzzle(p_themes text[])
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_themes is null or cardinality(p_themes) = 0 or cardinality(p_themes) > 10 then raise exception 'invalid_themes'; end if;
  return public.pick_puzzle(auth.uid(), p_themes);
end;
$$;

-- The player's puzzle results per motif (for the weakness profile).
create or replace function public.puzzle_theme_stats()
returns json language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object('theme', t.theme, 'attempts', t.attempts, 'solved', t.solved)), '[]'::json)
  from (
    select th as theme, count(*) as attempts, count(*) filter (where a.solved) as solved
    from public.puzzle_attempts a join public.puzzles p on p.id = a.puzzle_id, unnest(p.themes) th
    where a.user_id = auth.uid() and a.solved is not null
    group by th
  ) t;
$$;

create or replace function public.training_games_needed() returns int language sql immutable set search_path = public as $$ select 10 $$;

-- Whether training is unlocked: Plus, and enough finished games of at least 10 moves each.
create or replace function public.training_status()
returns json language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_games int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select count(*) into v_games from public.games
    where status = 'finished' and v_me in (white_id, black_id) and cardinality(moves_uci) >= 20;
  return json_build_object('plus', public.effective_plan(v_me) <> 'free', 'games', v_games,
                           'needed', public.training_games_needed());
end;
$$;

revoke execute on function public.next_training_puzzle(text[]) from public, anon;
revoke execute on function public.puzzle_theme_stats() from public, anon;
revoke execute on function public.training_status() from public, anon;
grant execute on function public.next_training_puzzle(text[]) to authenticated;
grant execute on function public.puzzle_theme_stats() to authenticated;
grant execute on function public.training_status() to authenticated;
