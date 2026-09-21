-- 66일 챌린지 하트 · 24h 유예 · SOS 충전 (챌린지당 유료 5개 한도)
-- Supabase SQL Editor에서 한 번 실행하세요.

alter table public.group_members add column if not exists hearts_remaining integer not null default 3;
alter table public.group_members add column if not exists hearts_purchased_count integer not null default 0;
alter table public.group_members add column if not exists used_paid_heart boolean not null default false;
alter table public.group_members add column if not exists expulsion_warning_at timestamptz;
alter table public.group_members add column if not exists member_status text not null default 'active';

alter table public.group_members drop constraint if exists group_members_member_status_check;
alter table public.group_members add constraint group_members_member_status_check
  check (member_status in ('active', 'warning', 'kicked'));

alter table public.group_members drop constraint if exists group_members_hearts_purchased_cap;
alter table public.group_members add constraint group_members_hearts_purchased_cap
  check (hearts_purchased_count >= 0 and hearts_purchased_count <= 5);

create index if not exists group_members_status_idx
  on public.group_members (user_id, member_status);
