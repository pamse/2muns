import { supabase } from "@/lib/supabase";
import type { Verification } from "@/lib/database.types";

const BUCKET = "verifications";

function extensionForBlob(blob: Blob) {
  const type = blob.type.toLowerCase();
  if (type.includes("mp4")) return "mp4";
  if (type.includes("quicktime")) return "mov";
  return "webm";
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function verificationObjectPath(groupId: string, day: number, userId: string, blob: Blob) {
  return `${safeSegment(groupId)}/${day}/${safeSegment(userId)}.${extensionForBlob(blob)}`;
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

export async function uploadVerificationVideo(input: {
  groupId: string;
  userId: string;
  day: number;
  blob: Blob;
}) {
  const path = verificationObjectPath(input.groupId, input.day, input.userId, input.blob);
  const { error } = await supabase.storage.from(BUCKET).upload(path, input.blob, {
    upsert: true,
    contentType: input.blob.type || "video/webm",
    cacheControl: "3600",
  });

  if (error) {
    throw new Error(error.message || "인증 영상 업로드에 실패했습니다.");
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
  const row = {
    group_id: input.groupId,
    user_id: input.userId,
    day: input.day,
    comment: input.comment || null,
    video_path: input.videoPath,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("verifications")
    .upsert(row, { onConflict: "group_id,user_id,day" })
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "인증 기록 저장에 실패했습니다.");
  }

  return (data ?? row) as Verification;
}
