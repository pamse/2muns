-- App Store UGC(1.2): bio, 차단, 신고
-- Supabase SQL Editor에서 한 번 실행하세요.

-- 1) 한 줄 소개
alter table public.users add column if not exists bio text not null default '';

-- 2) 차단
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocker_id_idx on public.blocks (blocker_id);

-- 3) 신고
create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users (id) on delete set null,
  reported_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists reports_reported_user_id_idx on public.reports (reported_user_id);

alter table public.blocks enable row level security;
alter table public.reports enable row level security;

drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own"
  on public.blocks for select
  to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own"
  on public.blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id);

drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own"
  on public.blocks for delete
  to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "reports_insert_own" on public.reports;
create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (reporter_id is null or auth.uid() = reporter_id);
