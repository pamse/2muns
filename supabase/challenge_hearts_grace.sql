-- [1/3] 66일 챌린지 · 하트 0 → 24h 유예 (group_members)
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.group_members add column if not exists hearts_remaining integer not null default 3;
alter table public.group_members add column if not exists hearts_purchased_count integer not null default 0;
alter table public.group_members add column if not exists expulsion_warning_at timestamptz;
alter table public.group_members add column if not exists status text not null default 'active';

-- 레거시 member_status → status (이전 마이그레이션 적용 환경)
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'group_members' and column_name = 'member_status'
  ) then
    execute $sql$
      update public.group_members
      set status = member_status
      where member_status is not null
        and (status is null or status = 'active')
    $sql$;
  end if;
end $$;

alter table public.group_members drop constraint if exists group_members_status_check;
alter table public.group_members add constraint group_members_status_check
  check (status in ('active', 'warning', 'kicked'));

alter table public.group_members drop constraint if exists group_members_hearts_purchased_cap;
alter table public.group_members add constraint group_members_hearts_purchased_cap
  check (hearts_purchased_count >= 0 and hearts_purchased_count <= 5);

create index if not exists group_members_user_status_idx
  on public.group_members (user_id, status);
