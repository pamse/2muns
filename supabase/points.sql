-- 포인트 잔액 / 슬롯 확장 / 하트 보너스 / 트랜잭션 이력

alter table public.users
  add column if not exists points integer not null default 0,
  add column if not exists extra_group_slots integer not null default 0;

create table if not exists public.user_group_bonuses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  heart_bonus integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, group_id)
);

create table if not exists public.point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  amount integer not null,
  reason text not null,
  ref_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, ref_key)
);

create index if not exists point_transactions_user_id_idx
  on public.point_transactions (user_id, created_at desc);
