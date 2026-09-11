"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dispatchProfileUpdated,
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

export function useMyProfileImage() {
  const [src, setSrc] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(MY_PROFILE_IMAGE_KEY);
      } catch {
        stored = null;
      }
      if (!cancelled && stored) {
        setSrc(stored);
      }

      const userId = readStoredUserId();
      if (!userId) return;

      const { data, error } = await supabase
        .from("users")
        .select("avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled || error || !data?.avatar_url) return;

      setSrc(data.avatar_url);
      try {
        window.localStorage.setItem(MY_PROFILE_IMAGE_KEY, data.avatar_url);
      } catch {
        // localStorage 용량 부족 시 메모리 상태만 유지
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

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
        try {
          window.localStorage.setItem(MY_PROFILE_IMAGE_KEY, dataUrl);
        } catch {
          window.alert(
            "저장 공간이 부족합니다. 더 작은 이미지를 선택하면 새로고침 후에도 유지됩니다.",
          );
        }
        dispatchProfileUpdated({ avatarUrl: dataUrl });
        return;
      }

      const publicUrl = await uploadProfileAvatar(userId, file);
      await syncProfileToSupabase({ userId, avatarUrl: publicUrl });
      setSrc(publicUrl);
      try {
        window.localStorage.setItem(MY_PROFILE_IMAGE_KEY, publicUrl);
      } catch {
        // URL은 짧아서 실패할 일이 거의 없음
      }
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
