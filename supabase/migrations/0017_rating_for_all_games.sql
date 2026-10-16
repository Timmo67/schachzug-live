-- One playing strength for everyone: all finished online games count (friends and random opponents), not
-- only random games. profiles.random_rating / random_games (0015) now hold this overall rating; the names
-- stay so that app builds already installed keep working. Each game stores both ratings before the game
-- and the change, so the game screen can show "1234 +12".

alter table public.games
  add column white_rating int,
  add column black_rating int,
  add column white_rating_diff int,
  add column black_rating_diff int;

-- ---------- Rating (Elo) ----------
-- Runs before the update that finishes a game, so the rating snapshot and the change are written in the
-- same row (and reach the players through Realtime with the result). A game counts once both sides have
-- moved; K = 40 for the first 20 rated games, then 20.
create or replace function public.rating_change(p_rating int, p_opp int, p_score float8, p_games int)
returns int language sql immutable set search_path = public as $$
  select greatest(100, p_rating + round(case when p_games < 20 then 40 else 20 end
    * (p_score - 1 / (1 + power(10, (p_opp - p_rating) / 400.0)))))::int - p_rating;
$$;

create or replace function public.rate_game()
returns trigger language plpgsql security definer set search_path = public as $$
declare w public.profiles; b public.profiles; v_score float8;
begin
  if new.status <> 'finished' or old.status = 'finished' or new.result is null
     or new.white_id is null or new.black_id is null or cardinality(new.moves_uci) < 2 then
    return new;
  end if;
  select * into w from public.profiles where id = new.white_id for update;
  select * into b from public.profiles where id = new.black_id for update;
  if w.id is null or b.id is null then return new; end if;
  v_score := case new.result when '1-0' then 1 when '0-1' then 0 else 0.5 end;
  new.white_rating := w.random_rating;
  new.black_rating := b.random_rating;
  new.white_rating_diff := public.rating_change(w.random_rating, b.random_rating, v_score, w.random_games);
  new.black_rating_diff := public.rating_change(b.random_rating, w.random_rating, 1 - v_score, b.random_games);
  update public.profiles set random_rating = random_rating + new.white_rating_diff, random_games = random_games + 1 where id = w.id;
  update public.profiles set random_rating = random_rating + new.black_rating_diff, random_games = random_games + 1 where id = b.id;
  return new;
end;
$$;
revoke execute on function public.rate_game() from public, anon, authenticated;
revoke execute on function public.rating_change(int, int, float8, int) from public, anon, authenticated;

-- Replaces 0015's AFTER trigger (random games only). Disabled instead of dropped: the Supabase MCP tool
-- hangs on drop statements in production.
alter table public.games disable trigger games_rate_random;
create trigger games_rate before update of status on public.games
  for each row execute function public.rate_game();
