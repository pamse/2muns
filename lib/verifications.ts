import {
  contentTypeForBlob,
  storageExtensionForBlob,
} from "@/lib/videoFormat";
import { supabase } from "@/lib/supabase";
import type { Verification } from "@/lib/database.types";

const BUCKET = "verifications";

type SupabaseErrorShape = {
  message?: string;
  details?: string;
  hint?: string;
  code?: string;
  status?: number;
};

export function logShortsModalSupabaseError(
  context: string,
  error: SupabaseErrorShape | null | undefined,
  meta?: Record<string, unknown>,
) {
  if (!error) return;
  console.error("[Shorts Modal Supabase Error]", error.message, error.details, error.hint, {
    context,
    code: error.code,
    status: error.status,
    ...meta,
  });
}

function normalizeUserId(userId: string) {
  return String(userId ?? "").trim().toLowerCase();
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Storage 경로: `{group_id}/{day}/{userId}_{day}_{ts}.mp4` (또는 webm fallback) */
export function verificationObjectPath(
  groupId: string,
  day: number,
  userId: string,
  blob?: Blob,
) {
  const ext = blob ? storageExtensionForBlob(blob) : "mp4";
  const uid = safeSegment(userId);
  const stamp = Date.now();
  if (ext === "mp4") {
    return `${safeSegment(groupId)}/${day}/${uid}_${day}_${stamp}.mp4`;
  }
  return `${safeSegment(groupId)}/${day}/${uid}_${day}_${stamp}.webm`;
}

/** 일차당 단일 파일 덮어쓰기용 (재업로드 시 동일 키) */
export function verificationObjectPathForUpsert(
  groupId: string,
  day: number,
  userId: string,
  blob: Blob,
) {
  const ext = storageExtensionForBlob(blob);
  const uid = safeSegment(userId);
  return `${safeSegment(groupId)}/${day}/${uid}.${ext}`;
}

export function verificationVideoUrl(path: string) {
  const trimmed = path.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  const objectPath = trimmed.replace(/^verifications\//, "");
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectPath);
  return data.publicUrl;
}

const VERIFICATION_SELECT_COLUMNS = [
  "id, group_id, user_id, day, comment, video_path, created_at",
  "group_id, user_id, day, comment, video_path",
  "group_id, user_id, day, video_path",
  "day, video_path, user_id",
] as const;

async function selectVerificationsForDay(
  groupId: string,
  day: number,
): Promise<Verification[]> {
  const gid = groupId.trim();
  let lastError: SupabaseErrorShape | null = null;

  for (const columns of VERIFICATION_SELECT_COLUMNS) {
    const { data, error } = await supabase
      .from("verifications")
      .select(columns)
      .eq("group_id", gid)
      .eq("day", day);

    if (!error) {
      return (data ?? []) as unknown as Verification[];
    }

    lastError = error as SupabaseErrorShape;
    logShortsModalSupabaseError("selectVerificationsForDay", lastError, {
      groupId: gid,
      day,
      columns,
    });

    const msg = (lastError.message ?? "").toLowerCase();
    const missingColumn =
      lastError.code === "PGRST204" ||
      lastError.code === "42703" ||
      msg.includes("column") ||
      lastError.status === 400;
    if (!missingColumn) break;
  }

  throw new Error(lastError?.message || "인증 기록을 불러오지 못했습니다.");
}

/** 모임·일차별 인증 row (Storage path → `verificationVideoUrl`) */
export async function fetchVerifications(groupId: string, day: number) {
  return selectVerificationsForDay(groupId, day);
}

/**
 * 주차 숏츠: 현재 유저의 일차 구간 인증.
 * RoomDetail과 동일하게 `group_id` + `day` 조회 후 user_id 매칭 (range 쿼리 400 회피).
 */
export async function fetchUserVerificationsInRange(
  groupId: string,
  userId: string,
  fromDay: number,
  toDay: number,
): Promise<Verification[]> {
  const gid = groupId.trim();
  const uid = normalizeUserId(userId);
  if (!gid || !uid || fromDay > toDay) return [];

  const results: Verification[] = [];
  const failures: string[] = [];

  for (let day = fromDay; day <= toDay; day += 1) {
    try {
      const rows = await selectVerificationsForDay(gid, day);
      const mine = rows.find(
        (row) => normalizeUserId(row.user_id) === uid,
      );
      if (mine?.video_path?.trim()) {
        results.push(mine);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "인증 영상을 불러오지 못했습니다.";
      failures.push(`day ${day}: ${message}`);
      console.error("[Shorts Modal Supabase Error]", message, undefined, undefined, {
        context: "fetchUserVerificationsInRange/day",
        groupId: gid,
        userId: uid,
        day,
      });
    }
  }

  if (results.length === 0 && failures.length === toDay - fromDay + 1) {
    throw new Error(failures[0] ?? "인증 영상을 불러오지 못했습니다.");
  }

  results.sort((a, b) => a.day - b.day);
  return results;
}

export function fileExtensionForVideoPath(path: string): string {
  const lower = path.trim().toLowerCase();
  if (lower.endsWith(".mp4")) return "mp4";
  if (lower.endsWith(".mov")) return "mov";
  if (lower.endsWith(".webm")) return "webm";
  return "mp4";
}

export async function fetchUserVerificationDays(groupId: string, userId: string) {
  const { data, error } = await supabase
    .from("verifications")
    .select("day")
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) {
    logShortsModalSupabaseError("fetchUserVerificationDays", error as SupabaseErrorShape, {
      groupId,
      userId,
    });
    throw new Error(error.message || "인증 기록을 불러오지 못했습니다.");
  }

  const days = new Set<number>();
  for (const row of data ?? []) {
    const day = Number(row.day);
    if (Number.isInteger(day) && day > 0) days.add(day);
  }
  return [...days];
}

export async function uploadVerificationVideo(input: {
  groupId: string;
  userId: string;
  day: number;
  blob: Blob;
}) {
  const path = verificationObjectPathForUpsert(
    input.groupId,
    input.day,
    input.userId,
    input.blob,
  );
  const contentType = contentTypeForBlob(input.blob);
  const { error } = await supabase.storage.from(BUCKET).upload(path, input.blob, {
    upsert: true,
    contentType,
    cacheControl: "3600",
  });

  if (error) {
    logShortsModalSupabaseError("uploadVerificationVideo", error as SupabaseErrorShape, {
      path,
    });
    throw new Error(
      error.message || "영상 업로드에 실패했습니다. 다시 시도해주세요.",
    );
  }

  return { path, publicUrl: verificationVideoUrl(path) };
}

export async function upsertVerification(input: {
  groupId: string;
  userId: string;
  day: number;
  comment: string;
  videoPath: string;
}) {
  const comment = input.comment.trim().slice(0, 20);
  const row = {
    group_id: input.groupId,
    user_id: input.userId,
    day: input.day,
    comment: comment || null,
    video_path: input.videoPath,
  };

  const { data, error } = await supabase
    .from("verifications")
    .upsert(row, { onConflict: "group_id,user_id,day" })
    .select("*")
    .maybeSingle();

  if (error) {
    logShortsModalSupabaseError("upsertVerification", error as SupabaseErrorShape, row);
    throw new Error(error.message || "인증 기록 저장에 실패했습니다.");
  }

  return (data ?? { ...row, id: "", created_at: new Date().toISOString() }) as Verification;
}

/** Storage 업로드 + verifications upsert (현재 유저 인증 제출) */
export async function submitVerification(input: {
  groupId: string;
  userId: string;
  day: number;
  comment: string;
  blob: Blob;
}): Promise<Verification> {
  const uploaded = await uploadVerificationVideo({
    groupId: input.groupId,
    userId: input.userId,
    day: input.day,
    blob: input.blob,
  });
  return upsertVerification({
    groupId: input.groupId,
    userId: input.userId,
    day: input.day,
    comment: input.comment,
    videoPath: uploaded.path,
  });
}
