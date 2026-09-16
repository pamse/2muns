import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9_]{2,10}$/;

function safeNickname(raw: string | null | undefined) {
  const trimmed = (raw ?? "").trim();
  if (
    trimmed.length >= 2 &&
    trimmed.length <= 10 &&
    NICKNAME_PATTERN.test(trimmed)
  ) {
    return trimmed;
  }
  return "사용자";
}

function pickMetaString(
  meta: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = meta[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

/** Apple은 최초 1회만 name/full_name을 내려줄 수 있음 (객체 또는 문자열) */
function pickAppleDisplayName(meta: Record<string, unknown>): string | null {
  const fromString = pickMetaString(meta, [
    "name",
    "full_name",
    "given_name",
    "family_name",
  ]);
  if (fromString) return fromString;

  const fullName = meta.full_name;
  if (fullName && typeof fullName === "object" && !Array.isArray(fullName)) {
    const record = fullName as Record<string, unknown>;
    const first =
      typeof record.firstName === "string"
        ? record.firstName.trim()
        : typeof record.given_name === "string"
          ? record.given_name.trim()
          : "";
    const last =
      typeof record.lastName === "string"
        ? record.lastName.trim()
        : typeof record.family_name === "string"
          ? record.family_name.trim()
          : "";
    const combined = [first, last].filter(Boolean).join(" ").trim();
    if (combined) return combined;
  }

  return null;
}

function resolveAuthEmail(user: User, meta: Record<string, unknown>): string | null {
  if (user.email?.trim()) return user.email.trim();
  const fromMeta = pickMetaString(meta, ["email"]);
  return fromMeta;
}

/** 카카오·Google·Apple OAuth user_metadata → 앱 프로필 필드 */
export function profileFromAuthUser(user: User) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const appMeta = user.app_metadata ?? {};
  const provider =
    pickMetaString(meta, ["provider"]) ??
    (typeof appMeta.provider === "string" ? appMeta.provider : null);
  const providers = appMeta.providers;
  const isApple =
    provider === "apple" ||
    (Array.isArray(providers) && providers.includes("apple"));

  const appleName = isApple ? pickAppleDisplayName(meta) : null;

  const rawNickname =
    appleName ??
    pickMetaString(meta, [
      "name",
      "full_name",
      "nickname",
      "user_name",
      "preferred_username",
      "display_name",
    ]) ??
    "";

  const nickname = safeNickname(rawNickname);

  const avatarUrl =
    pickMetaString(meta, [
      "avatar_url",
      "picture",
      "profile_image_url",
      "profile_image",
    ]) ?? null;

  return {
    id: user.id,
    email: resolveAuthEmail(user, meta),
    nickname,
    avatar_url: avatarUrl,
  };
}

/** 온보딩(닉네임 완료 여부) — 닉네임만 있어도 로그인 완료로 간주 */
export function isUserRegistrationComplete(
  row: {
    nickname: string | null;
    selected_categories: string[] | null;
  } | null,
): boolean {
  if (!row) return false;

  const nick = (row.nickname ?? "").trim();
  // 닉네임이 정상적으로 들어가 있기만 하면 기존 회원으로 인정하고 통과!
  if (!nick || nick === "사용자" || !NICKNAME_PATTERN.test(nick)) {
    return false;
  }

  // 설문(카테고리) 체크 조건 제거
  return true;
}

/** OAuth 직후 public.users 행 보장 (트리거 미적용 환경 폴백) */
export async function ensurePublicUserFromAuth(user: User | null | undefined) {
  if (!user?.id) return { ok: false as const, error: "missing user" };

  try {
    // 1. 이미 users 테이블에 사용자가 존재하는지 먼저 확인
    const { data: existingUser, error: fetchError } = await supabase
      .from("users")
      .select("id, nickname, avatar_url, email")
      .eq("id", user.id)
      .maybeSingle();

    // 2. 이미 존재하는 회원이면 기존 데이터를 덮어쓰지 않고 그대로 통과
    if (existingUser) {
      return { ok: true as const, profile: existingUser };
    }

    // 3. 완전히 새로운 신규 회원일 때만 최초 1회 생성 (INSERT)
    const profile = profileFromAuthUser(user);
    const { error: insertError } = await supabase.from("users").insert({
      id: profile.id,
      email: profile.email,
      nickname: profile.nickname,
      avatar_url: profile.avatar_url,
    });

    if (insertError) {
      // 혹시 다른 곳에서 동시에 생성되어 충돌(중복 키)이 난 경우도 에러가 아니므로 정상 처리
      if (insertError.code === "23505") {
        return { ok: true as const, profile };
      }

      console.error("ensurePublicUserFromAuth insert failed", {
        message: insertError.message,
        code: insertError.code,
        details: insertError.details,
        hint: insertError.hint,
        userId: user.id,
      });
      return { ok: false as const, error: insertError.message };
    }

    return { ok: true as const, profile };
  } catch (err: any) {
    console.error("ensurePublicUserFromAuth unexpected error:", err);
    return { ok: false as const, error: err?.message ?? "unknown error" };
  }
}