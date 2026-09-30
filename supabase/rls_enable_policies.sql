-- 2müns — public 스키마 RLS 일괄 활성화 + 정책 정리
-- Supabase Dashboard → SQL Editor에서 한 번 실행하세요.
-- (기존 *_select_all / using(true) 정책을 교체합니다.)

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = p_group_id
      and g.owner_id is not null
      and g.owner_id::uuid = auth.uid()
  );
$$;

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_group_owner(p_group_id)
    or exists (
      select 1
      from public.group_members gm
      where gm.group_id = p_group_id
        and gm.user_id::uuid = auth.uid()
    );
$$;

revoke all on function public.is_group_owner(uuid) from public;
revoke all on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_owner(uuid) to authenticated, anon;
grant execute on function public.is_group_member(uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;

drop policy if exists "users_select_all" on public.users;
drop policy if exists "users_insert_all" on public.users;
drop policy if exists "users_update_all" on public.users;
drop policy if exists "users_select_authenticated" on public.users;
drop policy if exists "users_insert_self" on public.users;
drop policy if exists "users_update_self" on public.users;

create policy "users_select_authenticated"
  on public.users for select
  to authenticated
  using (true);

create policy "users_insert_self"
  on public.users for insert
  to authenticated
  with check (id = auth.uid());

create policy "users_update_self"
  on public.users for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "users_delete_self"
  on public.users for delete
  to authenticated
  using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- groups
-- ---------------------------------------------------------------------------
alter table public.groups enable row level security;

drop policy if exists "groups_select_all" on public.groups;
drop policy if exists "groups_select_authenticated" on public.groups;
drop policy if exists "groups_insert_authenticated" on public.groups;
drop policy if exists "groups_update_members_or_owner" on public.groups;
drop policy if exists "groups_delete_owner" on public.groups;

create policy "groups_select_authenticated"
  on public.groups for select
  to authenticated
  using (coalesce(status, '') <> 'deleted');

create policy "groups_insert_authenticated"
  on public.groups for insert
  to authenticated
  with check (
    owner_id is null
    or owner_id::uuid = auth.uid()
  );

create policy "groups_update_members_or_owner"
  on public.groups for update
  to authenticated
  using (
    public.is_group_owner(id)
    or public.is_group_member(id)
  )
  with check (
    public.is_group_owner(id)
    or public.is_group_member(id)
  );

create policy "groups_delete_owner"
  on public.groups for delete
  to authenticated
  using (public.is_group_owner(id));

-- ---------------------------------------------------------------------------
-- group_members
-- ---------------------------------------------------------------------------
alter table public.group_members enable row level security;

drop policy if exists "group_members_select_all" on public.group_members;
drop policy if exists "group_members_insert_all" on public.group_members;
drop policy if exists "group_members_update_all" on public.group_members;
drop policy if exists "group_members_delete_all" on public.group_members;
drop policy if exists "group_members_select_authenticated" on public.group_members;
drop policy if exists "group_members_insert_self" on public.group_members;
drop policy if exists "group_members_update_self" on public.group_members;
drop policy if exists "group_members_delete_self_or_owner" on public.group_members;

create policy "group_members_select_authenticated"
  on public.group_members for select
  to authenticated
  using (true);

create policy "group_members_insert_self"
  on public.group_members for insert
  to authenticated
  with check (user_id::uuid = auth.uid());

create policy "group_members_update_self"
  on public.group_members for update
  to authenticated
  using (user_id::uuid = auth.uid())
  with check (user_id::uuid = auth.uid());

create policy "group_members_delete_self_or_owner"
  on public.group_members for delete
  to authenticated
  using (
    user_id::uuid = auth.uid()
    or public.is_group_owner(group_id)
  );

-- ---------------------------------------------------------------------------
-- verifications
-- ---------------------------------------------------------------------------
alter table public.verifications enable row level security;

drop policy if exists "verifications_select_all" on public.verifications;
drop policy if exists "verifications_insert_all" on public.verifications;
drop policy if exists "verifications_update_all" on public.verifications;
drop policy if exists "verifications_select_group_members" on public.verifications;
drop policy if exists "verifications_insert_self_member" on public.verifications;
drop policy if exists "verifications_update_self" on public.verifications;

create policy "verifications_select_group_members"
  on public.verifications for select
  to authenticated
  using (
    public.is_group_member(group_id::uuid)
  );

create policy "verifications_insert_self_member"
  on public.verifications for insert
  to authenticated
  with check (
    user_id = auth.uid()::text
    and public.is_group_member(group_id::uuid)
  );

create policy "verifications_update_self"
  on public.verifications for update
  to authenticated
  using (user_id = auth.uid()::text)
  with check (
    user_id = auth.uid()::text
    and public.is_group_member(group_id::uuid)
  );

create policy "verifications_delete_self"
  on public.verifications for delete
  to authenticated
  using (user_id = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- verification_cheers
-- ---------------------------------------------------------------------------
alter table public.verification_cheers enable row level security;

drop policy if exists "verification_cheers_select_all" on public.verification_cheers;
drop policy if exists "verification_cheers_insert_all" on public.verification_cheers;
drop policy if exists "verification_cheers_delete_all" on public.verification_cheers;
drop policy if exists "verification_cheers_select_group_members" on public.verification_cheers;
drop policy if exists "verification_cheers_insert_self" on public.verification_cheers;
drop policy if exists "verification_cheers_delete_self" on public.verification_cheers;

create policy "verification_cheers_select_group_members"
  on public.verification_cheers for select
  to authenticated
  using (public.is_group_member(group_id::uuid));

create policy "verification_cheers_insert_self"
  on public.verification_cheers for insert
  to authenticated
  with check (
    cheerer_user_id::uuid = auth.uid()
    and public.is_group_member(group_id::uuid)
  );

create policy "verification_cheers_delete_self"
  on public.verification_cheers for delete
  to authenticated
  using (cheerer_user_id::uuid = auth.uid());

-- ---------------------------------------------------------------------------
-- notices
-- ---------------------------------------------------------------------------
alter table public.notices enable row level security;

drop policy if exists "notices_delete_all" on public.notices;
drop policy if exists "notices_update_all" on public.notices;
drop policy if exists "notices_select_visible" on public.notices;
drop policy if exists "notices_insert_authenticated" on public.notices;
drop policy if exists "notices_update_recipient" on public.notices;
drop policy if exists "notices_delete_recipient_or_cheer" on public.notices;

create policy "notices_select_visible"
  on public.notices for select
  to authenticated
  using (
    user_id is null
    or user_id::uuid = auth.uid()
  );

create policy "notices_insert_authenticated"
  on public.notices for insert
  to authenticated
  with check (auth.uid() is not null);

create policy "notices_update_recipient"
  on public.notices for update
  to authenticated
  using (user_id::uuid = auth.uid())
  with check (user_id::uuid = auth.uid());

create policy "notices_delete_recipient_or_cheer"
  on public.notices for delete
  to authenticated
  using (
    user_id::uuid = auth.uid()
    or tag = 'cheer'
  );

-- ---------------------------------------------------------------------------
-- articles (Info 탭 — 읽기 전용)
-- ---------------------------------------------------------------------------
alter table public.articles enable row level security;

drop policy if exists "articles_select_all" on public.articles;
drop policy if exists "articles_select_authenticated" on public.articles;

create policy "articles_select_authenticated"
  on public.articles for select
  to authenticated, anon
  using (true);

-- ---------------------------------------------------------------------------
-- blocks / reports (UGC)
-- ---------------------------------------------------------------------------
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

drop policy if exists "blocks_select_own" on public.blocks;
drop policy if exists "blocks_insert_own" on public.blocks;
drop policy if exists "blocks_delete_own" on public.blocks;

create policy "blocks_select_own"
  on public.blocks for select
  to authenticated
  using (auth.uid() = blocker_id);

create policy "blocks_insert_own"
  on public.blocks for insert
  to authenticated
  with check (auth.uid() = blocker_id);

create policy "blocks_delete_own"
  on public.blocks for delete
  to authenticated
  using (auth.uid() = blocker_id);

drop policy if exists "reports_insert_own" on public.reports;

create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (reporter_id is null or auth.uid() = reporter_id);

-- ---------------------------------------------------------------------------
-- points (supabase/points.sql 미적용 DB는 스킵)
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('public.user_group_bonuses') is not null then
    execute 'alter table public.user_group_bonuses enable row level security';

    execute 'drop policy if exists "user_group_bonuses_select_self" on public.user_group_bonuses';
    execute 'drop policy if exists "user_group_bonuses_insert_self" on public.user_group_bonuses';
    execute 'drop policy if exists "user_group_bonuses_update_self" on public.user_group_bonuses';
    execute 'drop policy if exists "user_group_bonuses_delete_self" on public.user_group_bonuses';

    execute $policy$
      create policy "user_group_bonuses_select_self"
        on public.user_group_bonuses for select
        to authenticated
        using (user_id = auth.uid())
    $policy$;

    execute $policy$
      create policy "user_group_bonuses_insert_self"
        on public.user_group_bonuses for insert
        to authenticated
        with check (user_id = auth.uid())
    $policy$;

    execute $policy$
      create policy "user_group_bonuses_update_self"
        on public.user_group_bonuses for update
        to authenticated
        using (user_id = auth.uid())
        with check (user_id = auth.uid())
    $policy$;

    execute $policy$
      create policy "user_group_bonuses_delete_self"
        on public.user_group_bonuses for delete
        to authenticated
        using (user_id = auth.uid())
    $policy$;
  end if;
end $$;

do $$
begin
  if to_regclass('public.point_transactions') is not null then
    execute 'alter table public.point_transactions enable row level security';

    execute 'drop policy if exists "point_transactions_select_self" on public.point_transactions';
    execute 'drop policy if exists "point_transactions_insert_self" on public.point_transactions';

    execute $policy$
      create policy "point_transactions_select_self"
        on public.point_transactions for select
        to authenticated
        using (user_id = auth.uid())
    $policy$;

    execute $policy$
      create policy "point_transactions_insert_self"
        on public.point_transactions for insert
        to authenticated
        with check (user_id = auth.uid())
    $policy$;
  end if;
end $$;
