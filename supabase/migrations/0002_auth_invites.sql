-- M1: auto profile on signup, invite redemption, friend request responses

-- New auth user -> profile + free entitlement
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1), 'Spieler');
begin
  if char_length(v_name) < 2 then v_name := v_name || '_'; end if;
  insert into public.profiles (id, display_name) values (new.id, left(v_name, 24));
  insert into public.entitlements (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Redeem a friend's invite code: become friends + 30-day Plus trial (once, only if currently free)
create or replace function public.redeem_invite(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_inviter uuid;
  v_trial boolean := false;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select id into v_inviter from public.profiles where invite_code = upper(trim(p_code));
  if v_inviter is null then raise exception 'invite_not_found'; end if;
  if v_inviter = v_me then raise exception 'own_invite'; end if;

  insert into public.friendships (requester_id, addressee_id, status)
  values (v_inviter, v_me, 'accepted')
  on conflict (requester_id, addressee_id) do update set status = 'accepted', updated_at = now()
  where public.friendships.status <> 'blocked';

  if not exists (select 1 from public.referrals where invitee_id = v_me)
     and public.effective_plan(v_me) = 'free' then
    insert into public.referrals (inviter_id, invitee_id, trial_ends_at)
    values (v_inviter, v_me, now() + interval '30 days');
    update public.profiles set invited_by = v_inviter where id = v_me and invited_by is null;
    update public.entitlements
      set plan = 'plus', source = 'referral_trial', active_until = now() + interval '30 days',
          will_renew = false, updated_at = now()
      where user_id = v_me;
    v_trial := true;
  end if;

  return json_build_object('inviter_id', v_inviter, 'trial_granted', v_trial);
end;
$$;

-- Send a friend request by invite code (no trial)
create or replace function public.request_friend(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_other uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select id into v_other from public.profiles where invite_code = upper(trim(p_code));
  if v_other is null then raise exception 'invite_not_found'; end if;
  if v_other = v_me then raise exception 'own_invite'; end if;
  if exists (select 1 from public.friendships where requester_id = v_other and addressee_id = v_me) then
    update public.friendships set status = 'accepted', updated_at = now()
      where requester_id = v_other and addressee_id = v_me and status = 'pending';
  else
    insert into public.friendships (requester_id, addressee_id) values (v_me, v_other)
    on conflict do nothing;
  end if;
  return v_other;
end;
$$;

-- Addressee accepts or declines; either side can block
create or replace function public.respond_friend(p_other uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_action = 'accept' then
    update public.friendships set status = 'accepted', updated_at = now()
      where requester_id = p_other and addressee_id = v_me and status = 'pending';
  elsif p_action = 'decline' or p_action = 'remove' then
    delete from public.friendships
      where (requester_id = p_other and addressee_id = v_me) or (requester_id = v_me and addressee_id = p_other);
  elsif p_action = 'block' then
    delete from public.friendships
      where (requester_id = p_other and addressee_id = v_me) or (requester_id = v_me and addressee_id = p_other);
    insert into public.friendships (requester_id, addressee_id, status) values (v_me, p_other, 'blocked');
  else
    raise exception 'invalid_action';
  end if;
end;
$$;

-- Clients change friendships only through the functions above
alter policy friendships_update on public.friendships using (false);
alter policy friendships_request on public.friendships with check (false);
alter policy friendships_delete on public.friendships using (false);

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.are_friends(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;
revoke execute on function public.game_has_video(uuid) from public, anon, authenticated;
revoke execute on function public.redeem_invite(text) from public, anon;
revoke execute on function public.request_friend(text) from public, anon;
revoke execute on function public.respond_friend(uuid, text) from public, anon;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.request_friend(text) to authenticated;
grant execute on function public.respond_friend(uuid, text) to authenticated;
