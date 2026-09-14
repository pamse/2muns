"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { clearAllJoinedGroupCaches } from "@/lib/groups";
import { dispatchProfileUpdated, syncProfileToSupabase } from "@/lib/profile";
import { MY_PROFILE_IMAGE_KEY } from "./useMyProfileImage";

export const NICKNAME_KEY = "my_nickname";
export const NICKNAME_UPDATED_AT_KEY = "nickname_updated_at";
export const NICKNAME_CHANGE_LOG_KEY = "nickname_change_log";
export const USER_ID_KEY = "my_user_id";

export const NICKNAME_WINDOW_DAYS = 14;
export const NICKNAME_MAX_CHANGES = 2;

const NICKNAME_PATTERN = /^[가-힣a-zA-Z0-9_]{2,10}$/;
const WINDOW_MS = NICKNAME_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function validateNickname(raw: string) {
  const value = raw.trim();
  if (value.length < 2 || value.length > 10) {
    return "닉네임은 2자 이상 10자 이하로 입력해 주세요.";
  }
  if (!NICKNAME_PATTERN.test(value)) {
    return "한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.";
  }
  return null;
}

function readLog(): string[] {
  try {
    const raw = window.localStorage.getItem(NICKNAME_CHANGE_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function recentChangeTimes(log: string[], now = Date.now()) {
  return log
    .map((item) => new Date(item).getTime())
    .filter((time) => !Number.isNaN(time) && now - time < WINDOW_MS)
    .sort((a, b) => a - b);
}

export function remainingNicknameChanges(log: string[], now = Date.now()) {
  return Math.max(0, NICKNAME_MAX_CHANGES - recentChangeTimes(log, now).length);
}

export function nicknameLockDaysLeft(log: string[], now = Date.now()) {
  const recent = recentChangeTimes(log, now);
  if (recent.length < NICKNAME_MAX_CHANGES) {
    return 0;
  }
  const unlockAt = recent[0] + WINDOW_MS;
  return Math.max(1, Math.ceil((unlockAt - now) / (24 * 60 * 60 * 1000)));
}

export function readMyUserId() {
  try {
    return window.localStorage.getItem(USER_ID_KEY);
  } catch {
    return null;
  }
}

function getOrCreateUserId() {
  const existing = readMyUserId();
  if (existing) {
    return existing;
  }
  const id = crypto.randomUUID();
  try {
    window.localStorage.setItem(USER_ID_KEY, id);
  } catch {
    // localStorage 접근 불가 시 일회성 id 반환
  }
  return id;
}

async function resolveCanonicalUserId(nickname?: string | null) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) {
    const authId = session.user.id;
    try {
      window.localStorage.setItem(USER_ID_KEY, authId);
    } catch {
      // localStorage 접근 불가 시 무시
    }
    return authId;
  }

  let id = readMyUserId();
  const trimmed = nickname?.trim();

  if (id) {
    const { data: profileById } = await supabase
      .from("users")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (profileById?.id) {
      try {
        window.localStorage.setItem(USER_ID_KEY, id);
      } catch {
        // localStorage 접근 불가 시 무시
      }
      return id;
    }
  }

  if (trimmed) {
    const { data: profiles } = await supabase
      .from("users")
      .select("id")
      .ilike("nickname", trimmed)
      .order("nickname_updated_at", { ascending: false, nullsFirst: false })
      .limit(1);
    const canonical = profiles?.[0]?.id;
    if (canonical) {
      id = canonical;
    }
  }

  if (!id) {
    id = getOrCreateUserId();
  }
  try {
    window.localStorage.setItem(USER_ID_KEY, id);
  } catch {
    // localStorage 접근 불가 시 무시
  }
  return id;
}

async function syncUserToSupabase(payload: {
  nickname: string;
  nickname_updated_at: string;
  selected_categories?: string[];
}) {
  const id = await resolveCanonicalUserId(payload.nickname);
  const { error } = await supabase.from("users").upsert(
    {
      id,
      nickname: payload.nickname,
      nickname_updated_at: payload.nickname_updated_at,
      ...(payload.selected_categories
        ? { selected_categories: payload.selected_categories }
        : {}),
    },
    { onConflict: "id" },
  );

  if (error) {
    console.error("users upsert failed", error);
    throw error;
  }
}

function persistLocal(nickname: string, updatedAt: string, log: string[]) {
  window.localStorage.setItem(NICKNAME_KEY, nickname);
  window.localStorage.setItem(NICKNAME_UPDATED_AT_KEY, updatedAt);
  window.localStorage.setItem(NICKNAME_CHANGE_LOG_KEY, JSON.stringify(log));
}

const SESSION_KEYS = [
  NICKNAME_KEY,
  NICKNAME_UPDATED_AT_KEY,
  NICKNAME_CHANGE_LOG_KEY,
  USER_ID_KEY,
  MY_PROFILE_IMAGE_KEY,
  "has_seen_munsy_welcome",
  "munsy_welcome_pending",
] as const;

function isUserCacheKey(key: string) {
  const lower = key.toLowerCase();
  return (
    key.startsWith("muns:") ||
    key.startsWith("2muns_") ||
    key.startsWith("my_") ||
    lower.includes("nickname") ||
    lower.includes("profile") ||
    lower.includes("avatar") ||
    lower.includes("joined-groups") ||
    lower.includes("dismissed-notices") ||
    lower === "user" ||
    lower.startsWith("user") ||
    lower.includes("session")
  );
}

function removeUserCacheKeys() {
  for (const key of SESSION_KEYS) {
    window.localStorage.removeItem(key);
  }
  const extras: string[] = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && isUserCacheKey(key)) {
      extras.push(key);
    }
  }
  for (const key of extras) {
    window.localStorage.removeItem(key);
  }
}

export async function logoutLocalSession() {
  try {
    removeUserCacheKeys();
    clearAllJoinedGroupCaches();
  } catch {
    // localStorage 접근 불가 시에도 인증 해제는 시도
  }
  try {
    await supabase.auth.signOut();
  } catch (error) {
    console.error("supabase signOut failed", error);
  }
}

export function useNickname() {
  const [nickname, setNickname] = useState("");
  const [changeLog, setChangeLog] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [hasNickname, setHasNickname] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const stored = window.localStorage.getItem(NICKNAME_KEY)?.trim() || "";
        if (stored) {
          setNickname(stored);
          setHasNickname(true);
        }
        setChangeLog(readLog());
        if (stored) {
          const id = await resolveCanonicalUserId(stored);
          if (!cancelled) {
            setUserId(id);
          }
        } else if (!cancelled) {
          setUserId(null);
        }
      } catch {
        if (!cancelled) {
          setUserId(null);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const remaining = remainingNicknameChanges(changeLog);
  const lockDays = nicknameLockDaysLeft(changeLog);

  const saveInitialNickname = useCallback(
    async (nextNickname: string, selectedCategories?: string[]) => {
      const errorMessage = validateNickname(nextNickname);
      if (errorMessage) {
        throw new Error(errorMessage);
      }

      const trimmed = nextNickname.trim();
      const updatedAt = new Date().toISOString();
      persistLocal(trimmed, updatedAt, changeLog);
      setNickname(trimmed);
      setHasNickname(true);
      try {
        await syncUserToSupabase({
          nickname: trimmed,
          nickname_updated_at: updatedAt,
          selected_categories: selectedCategories,
        });
        const id = await resolveCanonicalUserId(trimmed);
        setUserId(id);
        await syncProfileToSupabase({ userId: id, nickname: trimmed });
        dispatchProfileUpdated({ userId: id, nickname: trimmed });
      } catch (error) {
        console.error("users upsert failed", error);
      }
    },
    [changeLog],
  );

  const changeNickname = useCallback(
    async (nextNickname: string) => {
      const errorMessage = validateNickname(nextNickname);
      if (errorMessage) {
        throw new Error(errorMessage);
      }

      const trimmed = nextNickname.trim();
      if (trimmed === nickname) {
        throw new Error("현재 닉네임과 같아요. 다른 닉네임을 입력해 주세요.");
      }

      const left = remainingNicknameChanges(changeLog);
      if (left <= 0) {
        const days = nicknameLockDaysLeft(changeLog);
        throw new Error(
          `닉네임은 14일 동안 2회만 변경할 수 있습니다. (남은 기간: ${days}일)`,
        );
      }

      const updatedAt = new Date().toISOString();
      const nextLog = [...changeLog, updatedAt];
      persistLocal(trimmed, updatedAt, nextLog);
      setNickname(trimmed);
      setChangeLog(nextLog);
      setHasNickname(true);
      try {
        await syncUserToSupabase({
          nickname: trimmed,
          nickname_updated_at: updatedAt,
        });
        const id = await resolveCanonicalUserId(trimmed);
        setUserId(id);
        await syncProfileToSupabase({ userId: id, nickname: trimmed });
        dispatchProfileUpdated({ userId: id, nickname: trimmed });
      } catch (error) {
        console.error("users upsert failed", error);
      }
    },
    [changeLog, nickname],
  );

  const clearSession = useCallback(async () => {
    await logoutLocalSession();
    setNickname("");
    setChangeLog([]);
    setHasNickname(false);
    setUserId(null);
  }, []);

  const resetLocalSession = useCallback(() => {
    setNickname("");
    setChangeLog([]);
    setHasNickname(false);
    setUserId(null);
  }, []);

  return {
    nickname,
    userId,
    ready,
    hasNickname,
    remaining,
    lockDays,
    saveInitialNickname,
    changeNickname,
    clearSession,
    resetLocalSession,
  };
}
