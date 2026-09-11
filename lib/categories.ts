const CATEGORY_THUMBNAILS = {
  morning: "/images/category/category_morning.png",
  study: "/images/category/category_study.png",
  workout: "/images/category/category_workout.png",
  mindset: "/images/category/category_mindset.png",
  etc: "/images/category/category_etc.png",
} as const;

function normalizeCategory(value?: string | null) {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s/_-]+/g, "");
}

export function getCategoryThumbnail(category?: string | null): string {
  const key = normalizeCategory(category);
  if (!key) return CATEGORY_THUMBNAILS.etc;

  if (
    key.includes("미라클모닝") ||
    key.includes("기상") ||
    key.includes("morning") ||
    key.includes("miracle")
  ) {
    return CATEGORY_THUMBNAILS.morning;
  }

  if (
    key.includes("공부") ||
    key.includes("독서") ||
    key.includes("학습") ||
    key.includes("성장") ||
    key.includes("study") ||
    key.includes("reading")
  ) {
    return CATEGORY_THUMBNAILS.study;
  }

  if (
    key.includes("운동") ||
    key.includes("헬스") ||
    key.includes("workout") ||
    key.includes("fitness")
  ) {
    return CATEGORY_THUMBNAILS.workout;
  }

  if (
    key.includes("마인드셋") ||
    key.includes("명상") ||
    key.includes("mindset") ||
    key.includes("meditation")
  ) {
    return CATEGORY_THUMBNAILS.mindset;
  }

  if (key.includes("기타") || key.includes("etc") || key.includes("자유")) {
    return CATEGORY_THUMBNAILS.etc;
  }

  return CATEGORY_THUMBNAILS.etc;
}

export function isCustomGroupCover(cover?: string | null) {
  const value = cover?.trim() || "";
  if (!value) return false;
  if (value.startsWith("/images/category/")) return false;
  if (value.includes("unsplash.com") || value.includes("images.unsplash")) return false;
  return true;
}

export function groupThumbnailSrc(group: {
  category?: string | null;
  cover?: string | null;
}) {
  if (isCustomGroupCover(group.cover)) return group.cover!.trim();
  return getCategoryThumbnail(group.category);
}
