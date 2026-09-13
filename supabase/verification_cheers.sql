-- 인증 카드 👍 응원 피드백
create table if not exists public.verification_cheers (
  id uuid primary key default gen_random_uuid(),
  group_id text not null,
  target_user_id text not null,
  cheerer_user_id text not null,
  day integer not null check (day >= 1 and day <= 66),
  created_at timestamptz not null default now(),
  unique (group_id, target_user_id, cheerer_user_id, day)
);

create index if not exists verification_cheers_group_day_idx
  on public.verification_cheers (group_id, day);

alter table public.verification_cheers enable row level security;

drop policy if exists "verification_cheers_select_all" on public.verification_cheers;
create policy "verification_cheers_select_all"
  on public.verification_cheers for select
  to anon, authenticated
  using (true);

drop policy if exists "verification_cheers_insert_all" on public.verification_cheers;
create policy "verification_cheers_insert_all"
  on public.verification_cheers for insert
  to anon, authenticated
  with check (true);

drop policy if exists "verification_cheers_delete_all" on public.verification_cheers;
create policy "verification_cheers_delete_all"
  on public.verification_cheers for delete
  to anon, authenticated
  using (true);

alter table if exists public.verification_cheers replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'verification_cheers'
  ) then
    execute 'alter publication supabase_realtime add table public.verification_cheers';
  end if;
end $$;
