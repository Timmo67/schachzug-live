-- Game analysis (Stockfish in the browser). The engine runs on the client; the server decides whether an
-- analysis may start (free: 1 per day, Plus and higher: unlimited) and keeps the result, so a game is
-- analysed only once per player and opening it again costs nothing.

create table public.game_analyses (
  game_id    uuid not null references public.games(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  evals      jsonb,                         -- null while running; array of {cp|mate, best} per position
  created_at timestamptz not null default now(),
  primary key (game_id, user_id)
);
alter table public.game_analyses enable row level security;
create index game_analyses_user_idx on public.game_analyses(user_id, created_at);
comment on table public.game_analyses is 'Engine analysis per finished game and player. Written only via begin_analysis/save_analysis.';

create policy game_analyses_select_own on public.game_analyses for select to authenticated
  using (user_id = (select auth.uid()));
create policy game_analyses_no_insert on public.game_analyses for insert to authenticated with check (false);
create policy game_analyses_no_update on public.game_analyses for update to authenticated using (false);

create or replace function public.analysis_free_per_day() returns int language sql immutable set search_path = public as $$ select 1 $$;

-- Starts (or resumes) the analysis of a finished game. Returns the stored evals if it was analysed
-- before, otherwise null after counting the analysis. Raises analysis_limit when the free quota is used.
create or replace function public.begin_analysis(p_game uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_row public.game_analyses;
  v_today int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.games g where g.id = p_game and v_me in (g.white_id, g.black_id)
                 and g.status = 'finished') then
    raise exception 'game_not_found';
  end if;
  select * into v_row from public.game_analyses where game_id = p_game and user_id = v_me;
  if found then return v_row.evals; end if;
  if public.effective_plan(v_me) = 'free' then
    select count(*) into v_today from public.game_analyses
      where user_id = v_me and created_at >= date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
    if v_today >= public.analysis_free_per_day() then raise exception 'analysis_limit'; end if;
  end if;
  insert into public.game_analyses (game_id, user_id) values (p_game, v_me);
  return null;
end;
$$;

-- Stores the result of an analysis that was started with begin_analysis.
create or replace function public.save_analysis(p_game uuid, p_evals jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_plies int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select cardinality(moves_uci) into v_plies from public.games where id = p_game;
  if jsonb_typeof(p_evals) <> 'array' or jsonb_array_length(p_evals) <> v_plies + 1 or pg_column_size(p_evals) > 200000 then
    raise exception 'invalid_analysis';
  end if;
  update public.game_analyses set evals = p_evals where game_id = p_game and user_id = v_me;
  if not found then raise exception 'analysis_not_started'; end if;
end;
$$;

-- How many free analyses are left today (null = unlimited).
create or replace function public.analysis_status()
returns json language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_today int;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if public.effective_plan(v_me) <> 'free' then return json_build_object('unlimited', true, 'remaining', null); end if;
  select count(*) into v_today from public.game_analyses
    where user_id = v_me and created_at >= date_trunc('day', now() at time zone 'Europe/Berlin') at time zone 'Europe/Berlin';
  return json_build_object('unlimited', false, 'remaining', greatest(0, public.analysis_free_per_day() - v_today));
end;
$$;

revoke execute on function public.begin_analysis(uuid) from public, anon;
revoke execute on function public.save_analysis(uuid, jsonb) from public, anon;
revoke execute on function public.analysis_status() from public, anon;
grant execute on function public.begin_analysis(uuid) to authenticated;
grant execute on function public.save_analysis(uuid, jsonb) to authenticated;
grant execute on function public.analysis_status() to authenticated;
