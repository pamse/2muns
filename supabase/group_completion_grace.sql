-- 완주 모임 24h 유예: completed_at (선택)
alter table public.groups
  add column if not exists completed_at timestamptz;
