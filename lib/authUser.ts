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

/** 카카오·Google OAuth user_metadata → 앱 프로필 필드 */
export function profileFromAuthUser(user: User) {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;

  const rawNickname =
    pickMetaString(meta, [
      "name",
      "full_name",
      "nickname",
      "user_name",
      "preferred_username",
      "display_name",
    ]) ?? "";

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
    email: user.email ?? null,
    nickname,
    avatar_url: avatarUrl,
  };
}

/** 온보딩(닉네임·습관 설문) 완료 여부 — `profiles.is_completed` 대신 public.users 기준 */
export function isUserRegistrationComplete(
  row: {
    nickname: string | null;
    selected_categories: string[] | null;
  } | null,
): boolean {
  if (!row) return false;

  const nick = (row.nickname ?? "").trim();
  if (!nick || nick === "사용자" || !NICKNAME_PATTERN.test(nick)) {
    return false;
  }

  const categories = row.selected_categories;
  return Array.isArray(categories) && categories.length > 0;
}

/** OAuth 직후 public.users 행 보장 (트리거 미적용 환경 폴백) */
export async function ensurePublicUserFromAuth(user: User | null | undefined) {
  if (!user?.id) return { ok: false as const, error: "missing user" };

  const profile = profileFromAuthUser(user);
  const { error } = await supabase.from("users").upsert(
    {
      id: profile.id,
      email: profile.email,
      nickname: profile.nickname,
      avatar_url: profile.avatar_url,
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("ensurePublicUserFromAuth upsert failed", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
      userId: user.id,
    });
    return { ok: false as const, error: error.message };
  }

  return { ok: true as const, profile };
}
