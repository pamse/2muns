-- 프로필 사진/닉네임 동기화
-- 마이페이지에서 프로필을 바꾸면 모임 카드·멤버 아바타가 최신 이미지를 쓰도록
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.group_members add column if not exists nickname text;
alter table public.group_members add column if not exists avatar_url text;

drop policy if exists "group_members_update_all" on public.group_members;
create policy "group_members_update_all"
  on public.group_members for update
  to anon, authenticated
  using (true)
  with check (true);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_objects_select" on storage.objects;
create policy "avatars_objects_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars_objects_insert" on storage.objects;
create policy "avatars_objects_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "avatars_objects_update" on storage.objects;
create policy "avatars_objects_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'avatars')
  with check (bucket_id = 'avatars');

alter table if exists public.users replica identity full;
alter table if exists public.group_members replica identity full;

drop policy if exists "users_select_all" on public.users;
create policy "users_select_all"
  on public.users for select
  to anon, authenticated
  using (true);

drop policy if exists "users_insert_all" on public.users;
create policy "users_insert_all"
  on public.users for insert
  to anon, authenticated
  with check (true);

drop policy if exists "users_update_all" on public.users;
create policy "users_update_all"
  on public.users for update
  to anon, authenticated
  using (true)
  with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'users'
  ) then
    execute 'alter publication supabase_realtime add table public.users';
  end if;
end $$;
