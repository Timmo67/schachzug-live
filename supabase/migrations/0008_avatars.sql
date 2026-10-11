-- Profile pictures in Storage bucket `avatars` (public read). Each user may only write files inside the
-- folder named after their own user id, e.g. `<uid>/avatar.webp`. Max 1 MB, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- Owners can list/read their own objects through the API (public URLs work for everyone anyway).
create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- avatar_url may only point to the user's own file in this project's avatars bucket (or be empty).
alter table public.profiles add constraint profiles_avatar_url_own
  check (avatar_url is null or avatar_url ~ ('/storage/v1/object/public/avatars/' || id::text || '/'));
