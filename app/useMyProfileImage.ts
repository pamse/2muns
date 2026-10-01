"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cacheBustAvatarUrl,
  dispatchProfileUpdated,
  isSupabasePublicAvatarUrl,
  PROFILE_UPDATED_EVENT,
  syncProfileToSupabase,
  uploadProfileAvatar,
} from "@/lib/profile";
import { supabase } from "@/lib/supabase";

export const MY_PROFILE_IMAGE_KEY = "my_profile_image";
const USER_ID_STORAGE_KEY = "my_user_id";
const MAX_BYTES = 5 * 1024 * 1024;

function readStoredUserId() {
  try {
    return window.localStorage.getItem(USER_ID_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readStoredAvatarUrl() {
  try {
    return window.localStorage.getItem(MY_PROFILE_IMAGE_KEY);
  } catch {
    return null;
  }
}

function displayAvatarUrl(url: string) {
  return cacheBustAvatarUrl(url, url);
}

function persistAvatarLocally(url: string) {
  try {
    window.localStorage.setItem(MY_PROFILE_IMAGE_KEY, url);
  } catch {
    // localStorage 용량 부족 시 메모리 상태만 유지
  }
}

export function useMyProfileImage() {
  const [src, setSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const hydrateAvatar = useCallback(async (userId?: string | null) => {
    const stored = readStoredAvatarUrl();
    if (stored?.trim()) {
      setSrc(displayAvatarUrl(stored.trim()));
    }

    const resolvedId = userId?.trim() || readStoredUserId();
    if (!resolvedId) return;

    const { data, error } = await supabase
      .from("users")
      .select("avatar_url")
      .eq("id", resolvedId)
      .maybeSingle();

    if (error) {
      console.error("profile avatar hydrate failed", { userId: resolvedId, error });
      return;
    }

    const remote = data?.avatar_url?.trim();
    if (remote) {
      persistAvatarLocally(remote);
      setSrc(displayAvatarUrl(remote));
      return;
    }

    const local = stored?.trim();
    if (local && isSupabasePublicAvatarUrl(local)) {
      try {
        await syncProfileToSupabase({ userId: resolvedId, avatarUrl: local.split("?")[0] ?? local });
      } catch (syncError) {
        console.error("profile avatar re-sync failed", { userId: resolvedId, syncError });
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (cancelled) return;
      await hydrateAvatar(readStoredUserId());
    })();

    const onProfileUpdated = () => {
      void hydrateAvatar(readStoredUserId());
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      const uid = session?.user?.id ?? null;
      if (uid) {
        void hydrateAvatar(uid);
        return;
      }
      setSrc(null);
    });

    return () => {
      cancelled = true;
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
      subscription.unsubscribe();
    };
  }, [hydrateAvatar]);

  const applyFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      window.alert("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    if (file.size > MAX_BYTES) {
      window.alert("5MB 이하의 이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    const preview = URL.createObjectURL(file);
    setSrc(preview);
    setUploading(true);

    const userId = readStoredUserId();

    try {
      if (!userId) {
        const dataUrl = await readFileAsDataUrl(file);
        setSrc(dataUrl);
        persistAvatarLocally(dataUrl);
        dispatchProfileUpdated({ avatarUrl: dataUrl });
        return;
      }

      const publicUrl = await uploadProfileAvatar(userId, file);
      await syncProfileToSupabase({ userId, avatarUrl: publicUrl });
      persistAvatarLocally(publicUrl);
      setSrc(displayAvatarUrl(publicUrl));
      dispatchProfileUpdated({ userId, avatarUrl: publicUrl });
    } catch (error) {
      console.error("profile image save failed", error);
      try {
        const dataUrl = await readFileAsDataUrl(file);
        setSrc(dataUrl);
      } catch {
        setSrc(null);
      }
      window.alert(
        error instanceof Error
          ? error.message
          : "프로필 사진을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      URL.revokeObjectURL(preview);
      setUploading(false);
    }
  }, []);

  const clearImage = useCallback(async () => {
    setSrc(null);
    try {
      window.localStorage.removeItem(MY_PROFILE_IMAGE_KEY);
    } catch {
      // localStorage 접근 불가 시 메모리 상태만 비움
    }

    const userId = readStoredUserId();
    if (userId) {
      try {
        await syncProfileToSupabase({ userId, avatarUrl: null });
      } catch (error) {
        console.error("profile image clear failed", error);
      }
      dispatchProfileUpdated({ userId, avatarUrl: null });
    } else {
      dispatchProfileUpdated({ avatarUrl: null });
    }
  }, []);

  return { src, applyFile, clearImage, uploading };
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("이미지를 읽지 못했습니다."));
        return;
      }
      resolve(result);
    };
    reader.onerror = () => reject(new Error("이미지를 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}
