-- OAuth(카카오/구글) 가입 시 public.users 자동 생성
-- Supabase SQL Editor에서 한 번 실행하세요.
-- auth.users INSERT 트리거 → raw_user_meta_data에서 닉네임·아바타 안전 추출

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nick text;
  avatar text;
begin
  nick := coalesce(
    nullif(trim(meta->>'name'), ''),
    nullif(trim(meta->>'full_name'), ''),
    nullif(trim(meta->>'nickname'), ''),
    nullif(trim(meta->>'user_name'), ''),
    nullif(trim(meta->>'preferred_username'), ''),
    '사용자'
  );

  if char_length(nick) > 10 then
    nick := left(nick, 10);
  end if;

  avatar := coalesce(
    nullif(trim(meta->>'avatar_url'), ''),
    nullif(trim(meta->>'picture'), ''),
    nullif(trim(meta->>'profile_image_url'), ''),
    null
  );

  insert into public.users (id, email, nickname, avatar_url)
  values (new.id, new.email, nick, avatar)
  on conflict (id) do update
  set
    email = coalesce(excluded.email, public.users.email),
    nickname = coalesce(nullif(public.users.nickname, ''), excluded.nickname),
    avatar_url = coalesce(excluded.avatar_url, public.users.avatar_url);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();
