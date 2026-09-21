-- 2müns · 인증 백엔드 1단계: verifications 테이블 + Storage 버킷
-- Supabase Dashboard → SQL Editor 에 붙여넣고 Run (한 번 실행)
--
-- 저장 경로 규칙: verifications/{group_id}/{day}/{user_id}.mp4 (webm fallback)
-- (클라이언트: lib/verifications.ts verificationObjectPathForUpsert)

-- ---------------------------------------------------------------------------
-- 1) verifications
-- ---------------------------------------------------------------------------
create table if not exists public.verifications (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id text not null,
  day integer not null check (day >= 1 and day <= 66),
  comment text check (comment is null or char_length(comment) <= 20),
  video_path text not null,
  created_at timestamptz not null default now(),
  constraint verifications_group_user_day_key unique (group_id, user_id, day)
);

create index if not exists verifications_group_day_idx
  on public.verifications (group_id, day);

create index if not exists verifications_user_group_idx
  on public.verifications (user_id, group_id);

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

-- upsert(onConflict) 시 기존 행 UPDATE 허용 (anon 클라이언트)

-- ---------------------------------------------------------------------------
-- 2) Storage bucket: verifications (public read → getPublicUrl)
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
  public = excluded.public,
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
-- 참고: 예전 supabase/verifications.sql 로 group_id text 테이블을 만든 경우
-- FK uuid 스키마로 맞추려면 별도 마이그레이션이 필요합니다. 신규 프로젝트는
-- 이 파일만 실행하면 됩니다.
-- ---------------------------------------------------------------------------
