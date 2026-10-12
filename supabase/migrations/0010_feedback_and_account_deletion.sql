-- Beta feedback from users, and self-service account deletion (GDPR Art. 17).

-- ---------- Feedback ----------
create table public.feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 3 and 2000),
  page       text check (char_length(page) <= 200),
  user_agent text check (char_length(user_agent) <= 400),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
create index feedback_user_idx on public.feedback(user_id);
comment on table public.feedback is 'Beta feedback. Users insert their own; only the team reads it (dashboard / service role).';

create policy feedback_insert_own on public.feedback for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy feedback_select_own on public.feedback for select to authenticated
  using (user_id = (select auth.uid()));

-- At most 10 feedback messages per user and hour (keeps the table clean if something loops).
create or replace function public.limit_feedback()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.feedback where user_id = new.user_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'feedback_rate_limit';
  end if;
  return new;
end;
$$;
revoke execute on function public.limit_feedback() from public, anon, authenticated;
create trigger feedback_rate_limit before insert on public.feedback
  for each row execute function public.limit_feedback();

-- ---------- Account deletion ----------
-- A pending draw offer must not block deleting the offering user.
alter table public.games drop constraint if exists games_draw_offer_by_fkey;
alter table public.games add constraint games_draw_offer_by_fkey
  foreign key (draw_offer_by) references public.profiles(id) on delete set null;

-- Deletes the calling user's account. Open challenges are cancelled and running games count as resigned,
-- so the opponent is not left waiting. Everything personal goes with the auth user via ON DELETE CASCADE;
-- finished games stay for the opponent's archive without a link to the deleted user.
-- The client removes the profile picture from Storage before calling this.
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  update public.games set status = 'aborted', termination = 'cancelled', finished_at = now(),
      version = version + 1, updated_at = now()
    where status = 'waiting' and v_me in (white_id, black_id);
  update public.games set status = 'finished', termination = 'resign',
      result = case when white_id = v_me then '0-1' else '1-0' end,
      draw_offer_by = null, finished_at = now(), version = version + 1, updated_at = now()
    where status = 'active' and v_me in (white_id, black_id);
  delete from auth.users where id = v_me;
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
