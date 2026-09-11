"use client";

import { useEffect, useState } from "react";

export const MY_PROFILE_IMAGE_KEY = "my_profile_image";
const MAX_BYTES = 5 * 1024 * 1024;

export function useMyProfileImage() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(MY_PROFILE_IMAGE_KEY);
      setSrc(stored || null);
    } catch {
      setSrc(null);
    }
  }, []);

  function applyFile(file: File) {
    if (!file.type.startsWith("image/")) {
      window.alert("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    if (file.size > MAX_BYTES) {
      window.alert("5MB 이하의 이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        return;
      }

      setSrc(result);

      try {
        window.localStorage.setItem(MY_PROFILE_IMAGE_KEY, result);
      } catch {
        window.alert(
          "저장 공간이 부족합니다. 더 작은 이미지를 선택하면 새로고침 후에도 유지됩니다.",
        );
      }
    };
    reader.readAsDataURL(file);
  }

  function clearImage() {
    setSrc(null);
    try {
      window.localStorage.removeItem(MY_PROFILE_IMAGE_KEY);
    } catch {
      // localStorage 접근 불가 시 메모리 상태만 비움
    }
  }

  return { src, applyFile, clearImage };
}
