-- Performance advisors: evaluate auth.uid() once per query, index foreign keys
alter policy profiles_insert_self on public.profiles with check (id = (select auth.uid()));
alter policy profiles_update_self on public.profiles using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy friendships_read on public.friendships using ((select auth.uid()) in (requester_id, addressee_id));
alter policy games_read on public.games using ((select auth.uid()) in (white_id, black_id));
alter policy games_create on public.games with check ((select auth.uid()) in (white_id, black_id) and status = 'waiting');
alter policy messages_read on public.game_messages using (exists (select 1 from public.games g where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)));
alter policy messages_write on public.game_messages with check (sender_id = (select auth.uid()) and exists (select 1 from public.games g where g.id = game_id and (select auth.uid()) in (g.white_id, g.black_id)));
alter policy entitlements_read_own on public.entitlements using (user_id = (select auth.uid()));
alter policy referrals_read on public.referrals using ((select auth.uid()) in (inviter_id, invitee_id));
alter policy video_usage_read on public.video_usage using (user_id = (select auth.uid()));
alter policy reports_create on public.reports with check (reporter_id = (select auth.uid()));
alter policy reports_read_own on public.reports using (reporter_id = (select auth.uid()));

create index if not exists friendships_addressee_idx on public.friendships(addressee_id);
create index if not exists game_messages_game_idx on public.game_messages(game_id);
create index if not exists game_messages_sender_idx on public.game_messages(sender_id);
create index if not exists games_draw_offer_idx on public.games(draw_offer_by);
create index if not exists profiles_invited_by_idx on public.profiles(invited_by);
create index if not exists referrals_inviter_idx on public.referrals(inviter_id);
create index if not exists reports_game_idx on public.reports(game_id);
create index if not exists reports_reported_idx on public.reports(reported_id);
create index if not exists reports_reporter_idx on public.reports(reporter_id);
