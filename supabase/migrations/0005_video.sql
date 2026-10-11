-- M3: video chat between the two players of a game.
-- Signalling runs over a private Realtime Broadcast channel `video:<game id>`; only the two players
-- may join it (RLS on realtime.messages). Media flows peer to peer and is never stored.
-- Allowance: unlimited if at least one player has Plus or higher, else 10 minutes per user and week,
-- counted on the server by heartbeats from the client.

alter table public.video_usage add column last_beat_at timestamptz;

create or replace function public.video_week_start()
returns date language sql stable set search_path = public as $$
  select date_trunc('week', now() at time zone 'Europe/Berlin')::date;
$$;

-- Free seconds per week (concept: 10 minutes).
create or replace function public.video_free_seconds()
returns int language sql immutable as $$ select 600 $$;

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

-- Called by the client about every 30 s while a call is connected. Counts the time since the
-- previous beat (at most 40 s, so a sleeping tab does not burn the quota) for free users.
create or replace function public.video_heartbeat(p_game uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_week date := public.video_week_start();
  v_row public.video_usage;
  v_add int := 0;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if not exists (select 1 from public.games g where g.id = p_game and v_me in (g.white_id, g.black_id)) then
    raise exception 'game_not_found';
  end if;
  if not public.game_has_video(p_game) then
    insert into public.video_usage (user_id, week_start, seconds, last_beat_at)
    values (v_me, v_week, 0, now())
    on conflict (user_id, week_start) do nothing;
    select * into v_row from public.video_usage where user_id = v_me and week_start = v_week for update;
    if v_row.last_beat_at is not null and now() - v_row.last_beat_at <= interval '40 seconds' then
      v_add := ceil(extract(epoch from (now() - v_row.last_beat_at)))::int;
    end if;
    update public.video_usage set seconds = seconds + v_add, last_beat_at = now()
      where user_id = v_me and week_start = v_week;
  end if;
  return public.video_status(p_game);
end;
$$;

revoke execute on function public.video_week_start() from public, anon, authenticated;
revoke execute on function public.video_free_seconds() from public, anon, authenticated;
revoke execute on function public.video_status(uuid) from public, anon;
revoke execute on function public.video_heartbeat(uuid) from public, anon;
grant execute on function public.video_status(uuid) to authenticated;
grant execute on function public.video_heartbeat(uuid) to authenticated;

-- Private broadcast channel `video:<game id>`: only the two players may receive and send.
create or replace function public.is_video_topic_player(p_topic text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_topic like 'video:%' and exists (
    select 1 from public.games g
    where g.id::text = split_part(p_topic, ':', 2) and (select auth.uid()) in (g.white_id, g.black_id)
  );
$$;
revoke execute on function public.is_video_topic_player(text) from public, anon;
grant execute on function public.is_video_topic_player(text) to authenticated;

create policy video_signal_receive on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and public.is_video_topic_player((select realtime.topic())));
create policy video_signal_send on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and public.is_video_topic_player((select realtime.topic())));
