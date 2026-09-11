-- 모임 목록 Realtime 동기화
-- Supabase SQL Editor에서 한 번 실행하세요.
-- (Dashboard > Database > Publications 에서 groups / group_members 를 supabase_realtime 에 추가해도 됩니다.)

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
