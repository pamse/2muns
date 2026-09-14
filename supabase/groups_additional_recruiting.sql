-- 24시간 추가 모집(방장 퇴장 후 번개 탑승)
alter table public.groups
  add column if not exists additional_recruiting_until timestamptz;

create index if not exists groups_additional_recruiting_until_idx
  on public.groups (additional_recruiting_until)
  where additional_recruiting_until is not null;
