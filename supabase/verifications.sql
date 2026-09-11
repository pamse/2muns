-- 2müns 실유저 테스트용: 인증 영상/코멘트 + Storage
-- Supabase SQL Editor에서 한 번에 실행하세요.

-- ---------------------------------------------------------------------------
-- 1) verifications
-- ---------------------------------------------------------------------------
create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  user_id text not null,
  day integer not null check (day >= 1 and day <= 66),
  comment text,
  video_path text not null,
  created_at timestamptz not null default now(),
  unique (group_id, user_id, day)
);

create index if not exists verifications_group_day_idx
  on public.verifications (group_id, day);

alter table public.verifications enable row level security;

drop policy if exists "verifications_select_all" on public.verifications;
create policy "verifications_select_all"
  on public.verifications for select
  to anon, authenticated
  using (true);

drop policy if exists "verifications_insert_all" on public.verifications;
create policy "verifications_insert_all"
  on public.verifications for insert
  to anon, authenticated
  with check (true);

drop policy if exists "verifications_update_all" on public.verifications;
create policy "verifications_update_all"
  on public.verifications for update
  to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 2) Storage bucket: verifications (public read, anyone can upload)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'verifications',
  'verifications',
  true,
  20971520,
  array['video/webm', 'video/mp4', 'video/quicktime', 'video/x-matroska']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "verifications_objects_select" on storage.objects;
create policy "verifications_objects_select"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'verifications');

drop policy if exists "verifications_objects_insert" on storage.objects;
create policy "verifications_objects_insert"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'verifications');

drop policy if exists "verifications_objects_update" on storage.objects;
create policy "verifications_objects_update"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'verifications')
  with check (bucket_id = 'verifications');

-- ---------------------------------------------------------------------------
-- 3) 모임 피드/입장에 필요한 보조 컬럼·멤버십 (없으면 실유저 테스트가 불가)
-- ---------------------------------------------------------------------------
alter table public.groups add column if not exists owner_id text;
alter table public.groups add column if not exists started_at timestamptz;

create table if not exists public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);

alter table public.group_members add column if not exists created_at timestamptz default now();

create index if not exists group_members_user_idx on public.group_members (user_id);

alter table public.group_members enable row level security;

drop policy if exists "group_members_select_all" on public.group_members;
create policy "group_members_select_all"
  on public.group_members for select
  to anon, authenticated
  using (true);

drop policy if exists "group_members_insert_all" on public.group_members;
create policy "group_members_insert_all"
  on public.group_members for insert
  to anon, authenticated
  with check (true);

drop policy if exists "group_members_delete_all" on public.group_members;
create policy "group_members_delete_all"
  on public.group_members for delete
  to anon, authenticated
  using (true);

drop policy if exists "group_members_update_all" on public.group_members;
create policy "group_members_update_all"
  on public.group_members for update
  to anon, authenticated
  using (true)
  with check (true);

alter table public.group_members add column if not exists nickname text;
alter table public.group_members add column if not exists avatar_url text;

-- 모임 목록 조회가 막혀 있는 프로젝트를 위한 기본 SELECT
drop policy if exists "groups_select_all" on public.groups;
create policy "groups_select_all"
  on public.groups for select
  to anon, authenticated
  using (true);

-- Realtime: 다른 기기에서 모임 생성/수정/삭제 시 피드가 즉시 갱신되도록 publication에 포함
alter table if exists public.groups replica identity full;
alter table if exists public.group_members replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'groups'
  ) then
    execute 'alter publication supabase_realtime add table public.groups';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'group_members'
  ) then
    execute 'alter publication supabase_realtime add table public.group_members';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'users'
  ) then
    execute 'alter publication supabase_realtime add table public.users';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 프로필 사진 Storage + users RLS (모임 카드/랭킹이 최신 아바타를 보도록)
-- ---------------------------------------------------------------------------
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
