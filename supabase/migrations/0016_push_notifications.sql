-- Push notifications for the iOS/Android apps. Database triggers put messages into push_queue and wake the
-- Edge Function send-push (via pg_net), which delivers them through Firebase Cloud Messaging (Android) and
-- APNs (iOS). Clients only register/unregister their own device token; everything else is server-side.

create extension if not exists pg_net with schema extensions;

-- ---------- Device tokens ----------
create table public.push_tokens (
  token      text primary key check (char_length(token) between 8 and 4096),
  user_id    uuid references public.profiles(id) on delete cascade, -- null = signed out / invalid
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
alter table public.push_tokens enable row level security;
create policy push_tokens_none on public.push_tokens for all to anon, authenticated using (false) with check (false);
create index push_tokens_user_idx on public.push_tokens(user_id);

-- ---------- Outgoing messages ----------
create table public.push_queue (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  kind         text not null,
  title        text not null,
  body         text not null,
  url          text not null,
  collapse_key text,
  status       text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'skipped', 'failed')),
  info         text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
alter table public.push_queue enable row level security;
create policy push_queue_none on public.push_queue for all to anon, authenticated using (false) with check (false);
create index push_queue_pending_idx on public.push_queue(status, id);
create index push_queue_user_idx on public.push_queue(user_id);

-- Where the database reaches send-push (production URL; supabase/seed.sql points local runs at the local stack).
create table public.push_settings (
  id           int primary key default 1 check (id = 1),
  function_url text not null
);
alter table public.push_settings enable row level security;
create policy push_settings_none on public.push_settings for all to anon, authenticated using (false) with check (false);
insert into public.push_settings (function_url) values ('https://jpdlxzpzeswkgsmderwh.supabase.co/functions/v1/send-push');

-- ---------- Client RPCs ----------
create or replace function public.register_push_token(p_token text, p_platform text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_platform not in ('ios', 'android') then raise exception 'invalid_platform'; end if;
  -- A device belongs to whoever signed in on it last.
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  perform public.forget_push_token(p_token, auth.uid());
end;
$$;

-- Detaches a token from its user (sign-out, or the push service reports it invalid; also used by send-push).
create or replace function public.forget_push_token(p_token text, p_user uuid)
returns void language sql security definer set search_path = public as $$
  update public.push_tokens set user_id = null, updated_at = now()
  where token = p_token and (p_user is null or user_id = p_user);
$$;

-- ---------- Queue + wake-up ----------
create or replace function public.push_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select display_name from public.profiles where id = p_user), 'Jemand');
$$;

create or replace function public.queue_push(p_user uuid, p_kind text, p_title text, p_body text, p_url text, p_collapse text)
returns void language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  -- Only users with a registered app get messages; web users keep the in-app notifications.
  if p_user is null or not exists (select 1 from public.push_tokens where user_id = p_user) then return; end if;
  insert into public.push_queue (user_id, kind, title, body, url, collapse_key)
    values (p_user, p_kind, left(p_title, 120), left(p_body, 300), p_url, p_collapse);
  select function_url into v_url from public.push_settings where id = 1;
  if v_url is not null then
    perform net.http_post(url := v_url, body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb);
  end if;
exception when others then
  -- A push problem must never block a move, a challenge or a chat message.
  raise warning 'queue_push failed: %', sqlerrm;
end;
$$;

-- send-push takes a batch (also picks up rows stuck in 'sending' after a crash).
create or replace function public.claim_push_batch(p_limit int default 50)
returns setof public.push_queue language sql security definer set search_path = public as $$
  update public.push_queue q set status = 'sending', sent_at = now()
  where q.id in (
    select id from public.push_queue
    where status = 'pending' or (status = 'sending' and sent_at < now() - interval '5 minutes')
    order by id limit p_limit
    for update skip locked)
  returning q.*;
$$;

-- ---------- Triggers ----------
create or replace function public.push_on_game()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_url text := '/partie/' || new.id;
  v_mover uuid;
  v_next uuid;
  v_opp uuid;
  p uuid;
  v_won boolean;
begin
  if tg_op = 'INSERT' then
    if new.status = 'waiting' then
      v_opp := case when new.created_by = new.white_id then new.black_id else new.white_id end;
      perform public.queue_push(v_opp, 'challenge', 'Neue Herausforderung',
        public.push_name(new.created_by) || ' fordert dich zu einer Partie heraus.', '/partien', 'challenge:' || new.id);
    end if;
    return new;
  end if;

  -- Challenge accepted.
  if old.status = 'waiting' and new.status = 'active' then
    v_opp := case when new.created_by = new.white_id then new.black_id else new.white_id end;
    perform public.queue_push(new.created_by, 'accepted', 'Herausforderung angenommen',
      public.push_name(v_opp) || ' spielt mit – du kannst loslegen.', v_url, 'move:' || new.id);
  end if;

  -- A move was made: tell the player who is now to move.
  if new.status = 'active' and cardinality(new.moves_uci) > cardinality(old.moves_uci) then
    v_next := case when cardinality(new.moves_uci) % 2 = 0 then new.white_id else new.black_id end;
    v_mover := case when v_next = new.white_id then new.black_id else new.white_id end;
    perform public.queue_push(v_next, 'move', 'Du bist am Zug',
      public.push_name(v_mover) || ' hat gezogen.', v_url, 'move:' || new.id);
  end if;

  -- Draw offered.
  if new.status = 'active' and new.draw_offer_by is not null and new.draw_offer_by is distinct from old.draw_offer_by then
    v_opp := case when new.draw_offer_by = new.white_id then new.black_id else new.white_id end;
    perform public.queue_push(v_opp, 'draw_offer', 'Remis-Angebot',
      public.push_name(new.draw_offer_by) || ' bietet dir Remis an.', v_url, 'move:' || new.id);
  end if;

  -- Game over: both players (the one looking at the game has the app open and sees no push).
  if new.status = 'finished' and old.status <> 'finished' then
    foreach p in array array[new.white_id, new.black_id] loop
      v_opp := case when p = new.white_id then new.black_id else new.white_id end;
      v_won := (new.result = '1-0' and p = new.white_id) or (new.result = '0-1' and p = new.black_id);
      perform public.queue_push(p, 'finished', 'Partie beendet',
        'Gegen ' || public.push_name(v_opp) || ': ' ||
        case when new.result = '1/2-1/2' then 'Remis.' when v_won then 'Du hast gewonnen!' else 'Du hast verloren.' end,
        v_url, 'move:' || new.id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger games_push after insert or update on public.games
  for each row execute function public.push_on_game();

create or replace function public.push_on_friendship()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid(); v_other uuid;
begin
  v_other := case when v_actor = new.requester_id then new.addressee_id else new.requester_id end;
  if v_actor is null then return new; end if;
  if tg_op = 'INSERT' and new.status = 'pending' then
    perform public.queue_push(new.addressee_id, 'friend_request', 'Freundschaftsanfrage',
      public.push_name(new.requester_id) || ' möchte mit dir befreundet sein.', '/freunde', 'friend:' || new.requester_id);
  elsif new.status = 'accepted' and (tg_op = 'INSERT' or old.status <> 'accepted') then
    perform public.queue_push(v_other, 'friend_accepted', 'Neuer Freund',
      public.push_name(v_actor) || ' ist jetzt mit dir befreundet.', '/freunde', 'friend:' || v_actor);
  end if;
  return new;
end;
$$;
create trigger friendships_push after insert or update on public.friendships
  for each row execute function public.push_on_friendship();

create or replace function public.push_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare g public.games; v_to uuid;
begin
  select * into g from public.games where id = new.game_id;
  v_to := case when new.sender_id = g.white_id then g.black_id else g.white_id end;
  perform public.queue_push(v_to, 'chat', public.push_name(new.sender_id), new.body, '/partie/' || new.game_id, 'chat:' || new.game_id);
  return new;
end;
$$;
create trigger game_messages_push after insert on public.game_messages
  for each row execute function public.push_on_message();

-- ---------- Grants ----------
revoke execute on function public.register_push_token(text, text) from public, anon;
revoke execute on function public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
revoke execute on function public.forget_push_token(text, uuid) from public, anon, authenticated;
revoke execute on function public.push_name(uuid) from public, anon, authenticated;
revoke execute on function public.queue_push(uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.claim_push_batch(int) from public, anon, authenticated;
revoke execute on function public.push_on_game() from public, anon, authenticated;
revoke execute on function public.push_on_friendship() from public, anon, authenticated;
revoke execute on function public.push_on_message() from public, anon, authenticated;
grant execute on function public.forget_push_token(text, uuid) to service_role;
grant execute on function public.claim_push_batch(int) to service_role;
