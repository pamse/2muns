import { supabase } from "@/lib/supabase";

export const PROFILE_UPDATED_EVENT = "muns:profile-updated";
export const AVATARS_BUCKET = "avatars";

export type ProfileUpdatedDetail = {
  userId?: string | null;
  nickname?: string | null;
  avatarUrl?: string | null;
};

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function extensionForImage(file: File) {
  const type = file.type.toLowerCase();
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  return "jpg";
}

export function cacheBustAvatarUrl(url: string | null | undefined, version?: string | number) {
  if (!url) return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:") || trimmed.startsWith("blob:") || trimmed.startsWith("/")) {
    return trimmed;
  }
  const stamp = String(version ?? Date.now());
  try {
    const parsed = new URL(trimmed);
    parsed.searchParams.delete("t");
    parsed.searchParams.set("v", stamp);
    return parsed.toString();
  } catch {
    const cleaned = trimmed.replace(/[?&](?:t|v)=[^&]*/g, "").replace(/[?&]$/, "");
    const separator = cleaned.includes("?") ? "&" : "?";
    return `${cleaned}${separator}v=${stamp}`;
  }
}

export function pickMemberAvatarUrl(member: {
  avatar?: string | null;
  avatar_url?: string | null;
  image?: string | null;
  src?: string | null;
  profile?: { avatar_url?: string | null; avatarUrl?: string | null } | null;
} | null | undefined) {
  if (!member) return "";
  const candidates = [
    member.avatar,
    member.avatar_url,
    member.image,
    member.src,
    member.profile?.avatar_url,
    member.profile?.avatarUrl,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

export function dispatchProfileUpdated(detail: ProfileUpdatedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ProfileUpdatedDetail>(PROFILE_UPDATED_EVENT, { detail }));
}

export async function uploadProfileAvatar(userId: string, file: File) {
  const path = `${safeSegment(userId)}/${Date.now()}.${extensionForImage(file)}`;
  const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type || "image/jpeg",
    cacheControl: "0",
  });
  if (error) {
    throw new Error(error.message || "프로필 사진 업로드에 실패했습니다.");
  }
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
  return cacheBustAvatarUrl(data.publicUrl, Date.now());
}

function isMissingColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = (error.message || "").toLowerCase();
  return (
    error.code === "PGRST204" ||
    error.code === "42703" ||
    message.includes("avatar_url") ||
    message.includes("nickname") ||
    message.includes("schema cache")
  );
}

export async function syncProfileToSupabase(input: {
  userId: string;
  nickname?: string | null;
  avatarUrl?: string | null;
}) {
  const userPatch: {
    id: string;
    nickname?: string | null;
    avatar_url?: string | null;
  } = { id: input.userId };
  if (input.nickname !== undefined) userPatch.nickname = input.nickname;
  if (input.avatarUrl !== undefined) userPatch.avatar_url = input.avatarUrl;

  const { error: userError } = await supabase.from("users").upsert(userPatch, {
    onConflict: "id",
  });
  if (userError) {
    console.error("users profile upsert failed", userError);
    throw new Error(userError.message || "프로필을 저장하지 못했습니다.");
  }

  const memberPatch: { nickname?: string | null; avatar_url?: string | null } = {};
  if (input.nickname !== undefined) memberPatch.nickname = input.nickname;
  if (input.avatarUrl !== undefined) memberPatch.avatar_url = input.avatarUrl;
  if (Object.keys(memberPatch).length === 0) return;

  const { error: memberError } = await supabase
    .from("group_members")
    .update(memberPatch)
    .eq("user_id", input.userId);
  if (memberError && !isMissingColumnError(memberError)) {
    console.error("group_members profile update failed", memberError);
  }
}
