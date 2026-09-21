import { supabase } from "@/lib/supabase";
import type { Verification } from "@/lib/database.types";

const BUCKET = "verifications";

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Storage 경로: `{group_id}/{day}/{user_id}.webm` */
export function verificationObjectPath(
  groupId: string,
  day: number,
  userId: string,
  _blob?: Blob,
) {
  return `${safeSegment(groupId)}/${day}/${safeSegment(userId)}.webm`;
}

export function verificationVideoUrl(path: string) {
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("blob:")
  ) {
    return path;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function fetchVerifications(groupId: string, day: number) {
  const { data, error } = await supabase
    .from("verifications")
    .select("*")
    .eq("group_id", groupId)
    .eq("day", day);

  if (error) {
    throw new Error(error.message || "인증 기록을 불러오지 못했습니다.");
  }
  return (data ?? []) as Verification[];
}

export async function fetchUserVerificationDays(groupId: string, userId: string) {
  const { data, error } = await supabase
    .from("verifications")
    .select("day")
    .eq("group_id", groupId)
    .eq("user_id", userId);

  if (error) {
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
  const path = verificationObjectPath(
    input.groupId,
    input.day,
    input.userId,
    input.blob,
  );
  const { error } = await supabase.storage.from(BUCKET).upload(path, input.blob, {
    upsert: true,
    contentType: "video/webm",
    cacheControl: "3600",
  });

  if (error) {
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
