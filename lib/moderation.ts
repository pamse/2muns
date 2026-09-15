import { normalizeGroupId, type Group, type Member } from "@/app/data";
import type { Verification } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

export const BIO_MAX_LENGTH = 40;

const LOCAL_BLOCKS_KEY = "muns:blocked-user-ids";

export const REPORT_REASONS = [
  "스팸/홍보",
  "부적절한 이미지",
  "괴롭힘 및 혐오",
  "기타",
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];

export type PublicUserProfile = {
  id: string;
  nickname: string;
  avatarUrl: string | null;
  bio: string;
};

export type PublicVerificationCard = {
  id: string;
  groupId: string;
  groupName: string;
  day: number;
  comment: string | null;
  videoPath: string;
  createdAt: string;
};

function readLocalBlockedIds(blockerId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(LOCAL_BLOCKS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    const list = parsed[normalizeGroupId(blockerId)] ?? [];
    return new Set(list.map(normalizeGroupId).filter(Boolean));
  } catch {
    return new Set();
  }
}

function writeLocalBlockedIds(blockerId: string, ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(LOCAL_BLOCKS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
    parsed[normalizeGroupId(blockerId)] = [...ids];
    window.localStorage.setItem(LOCAL_BLOCKS_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

export function isModerationSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string; details?: string };
  const blob = [record.message, record.details].filter(Boolean).join(" ").toLowerCase();
  if (record.code === "PGRST205" || record.code === "42P01") return true;
  if (blob.includes("blocks") || blob.includes("reports")) return true;
  if (blob.includes("schema cache") || blob.includes("could not find")) return true;
  if (blob.includes("bio") && blob.includes("column")) return true;
  return false;
}

export async function fetchBlockedUserIds(blockerId: string): Promise<Set<string>> {
  const normalized = normalizeGroupId(blockerId);
  if (!normalized) return new Set();

  try {
    const { data, error } = await supabase
      .from("blocks")
      .select("blocked_id")
      .eq("blocker_id", normalized);

    if (error) {
      if (isModerationSchemaMissingError(error)) {
        return readLocalBlockedIds(normalized);
      }
      console.error("blocks select failed", error);
      return readLocalBlockedIds(normalized);
    }

    const remote = new Set(
      (data ?? []).map((row) => normalizeGroupId(row.blocked_id)).filter(Boolean),
    );
    writeLocalBlockedIds(normalized, remote);
    return remote;
  } catch (error) {
    console.error("blocks select failed", error);
    return readLocalBlockedIds(normalized);
  }
}

export async function blockUser(blockerId: string, blockedId: string): Promise<boolean> {
  const blocker = normalizeGroupId(blockerId);
  const blocked = normalizeGroupId(blockedId);
  if (!blocker || !blocked || blocker === blocked) return false;

  const local = readLocalBlockedIds(blocker);
  local.add(blocked);
  writeLocalBlockedIds(blocker, local);

  try {
    const { error } = await supabase.from("blocks").insert({
      blocker_id: blocker,
      blocked_id: blocked,
    });
    if (error && error.code !== "23505" && !isModerationSchemaMissingError(error)) {
      console.error("blocks insert failed", error);
      return false;
    }
    return true;
  } catch (error) {
    if (!isModerationSchemaMissingError(error)) {
      console.error("blocks insert failed", error);
    }
    return true;
  }
}

export async function submitUserReport(input: {
  reporterId: string | null;
  reportedUserId: string;
  reason: string;
}): Promise<boolean> {
  const reported = normalizeGroupId(input.reportedUserId);
  const reporter = input.reporterId ? normalizeGroupId(input.reporterId) : null;
  if (!reported) return false;

  const reason = input.reason.trim();
  if (!reason) return false;

  try {
    const { error } = await supabase.from("reports").insert({
      reporter_id: reporter,
      reported_user_id: reported,
      reason,
      status: "pending",
    });
    if (error) {
      if (isModerationSchemaMissingError(error)) {
        console.warn("reports table missing — report logged locally only", { reported, reason });
        return true;
      }
      console.error("reports insert failed", error);
      return false;
    }
    return true;
  } catch (error) {
    if (isModerationSchemaMissingError(error)) {
      return true;
    }
    console.error("reports insert failed", error);
    return false;
  }
}

export async function fetchUserBio(userId: string): Promise<string> {
  const id = normalizeGroupId(userId);
  if (!id) return "";
  try {
    const { data, error } = await supabase
      .from("users")
      .select("bio")
      .eq("id", id)
      .maybeSingle();
    if (error) {
      if (isModerationSchemaMissingError(error)) return "";
      return "";
    }
    return (data?.bio ?? "").trim();
  } catch {
    return "";
  }
}

export async function updateUserBio(userId: string, bio: string): Promise<string> {
  const id = normalizeGroupId(userId);
  if (!id) throw new Error("로그인이 필요합니다.");
  const trimmed = bio.trim().slice(0, BIO_MAX_LENGTH);

  const { error } = await supabase.from("users").update({ bio: trimmed }).eq("id", id);
  if (error) {
    if (isModerationSchemaMissingError(error)) {
      throw new Error("한 줄 소개 저장을 위해 DB 마이그레이션이 필요합니다.");
    }
    throw new Error(error.message || "한 줄 소개 저장에 실패했습니다.");
  }
  return trimmed;
}

export async function fetchPublicUserProfile(userId: string): Promise<PublicUserProfile | null> {
  const id = normalizeGroupId(userId);
  if (!id) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, nickname, avatar_url, bio")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    nickname: data.nickname?.trim() || "모임원",
    avatarUrl: data.avatar_url,
    bio: (data.bio ?? "").trim(),
  };
}

export async function fetchPublicVerificationsForUser(
  userId: string,
  limit = 12,
): Promise<PublicVerificationCard[]> {
  const id = normalizeGroupId(userId);
  if (!id) return [];

  const { data: verRows, error } = await supabase
    .from("verifications")
    .select("id, group_id, day, comment, video_path, created_at")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !verRows?.length) return [];

  const groupIds = [...new Set(verRows.map((row) => row.group_id))];
  const { data: groups } = await supabase
    .from("groups")
    .select("id, title")
    .in("id", groupIds);

  const titleById = new Map((groups ?? []).map((g) => [g.id, g.title]));

  return verRows.map((row) => ({
    id: row.id,
    groupId: row.group_id,
    groupName: titleById.get(row.group_id) ?? "모임",
    day: row.day,
    comment: row.comment,
    videoPath: row.video_path,
    createdAt: row.created_at,
  }));
}

export function isUserBlocked(userId: string | null | undefined, blocked: ReadonlySet<string>) {
  const id = normalizeGroupId(userId);
  if (!id) return false;
  return blocked.has(id);
}

export function filterGroupMembers(group: Group, blocked: ReadonlySet<string>): Group {
  if (blocked.size === 0) return group;
  const members = group.members.filter((m) => !isUserBlocked(m.id, blocked));
  if (members.length === group.members.length) return group;
  return { ...group, members };
}

export function filterMembersList(members: Member[], blocked: ReadonlySet<string>) {
  if (blocked.size === 0) return members;
  return members.filter((m) => !isUserBlocked(m.id, blocked));
}

export function filterVerificationsByBlock(
  rows: Verification[],
  blocked: ReadonlySet<string>,
): Verification[] {
  if (blocked.size === 0) return rows;
  return rows.filter((row) => !isUserBlocked(row.user_id, blocked));
}

export function filterGroupsByBlockedMembers(
  groups: Group[],
  blocked: ReadonlySet<string>,
): Group[] {
  if (blocked.size === 0) return groups;
  return groups.map((g) => filterGroupMembers(g, blocked));
}
