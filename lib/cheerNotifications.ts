import { normalizeGroupId } from "@/app/data";
import type { Notice } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

const REF_STORAGE_KEY = "muns:cheer-notice-refs";

export const CHEER_NOTICE_TAG = "CHEER";

function refKey(
  groupId: string,
  day: number,
  targetUserId: string,
  cheererUserId: string,
) {
  return `${normalizeGroupId(groupId)}:${day}:${normalizeGroupId(targetUserId)}:${normalizeGroupId(cheererUserId)}`;
}

function readRefs(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(REF_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRefs(refs: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(refs));
}

function saveRef(key: string, noticeId: string) {
  const refs = readRefs();
  refs[key] = noticeId;
  writeRefs(refs);
}

function popRef(key: string) {
  const refs = readRefs();
  const noticeId = refs[key];
  if (noticeId) {
    delete refs[key];
    writeRefs(refs);
  }
  return noticeId;
}

export function cheerLinkMeta(groupId: string, day: number) {
  return `cheer://${groupId}/${day}`;
}

export function parseCheerLink(content: string) {
  const match = content.match(/cheer:\/\/([^/\n]+)\/(\d+)\s*$/);
  if (!match) return null;
  return { groupId: match[1], day: Number.parseInt(match[2], 10) };
}

export function displayNoticeContent(content: string) {
  return content.replace(/\ncheer:\/\/[^\n]+$/, "").trim();
}

export function isCheerNotice(notice: Notice) {
  return notice.tag?.trim().toUpperCase() === CHEER_NOTICE_TAG;
}

export async function createCheerNotice(input: {
  recipientUserId: string;
  cheererUserId: string;
  cheererNickname: string;
  groupId: string;
  groupName: string;
  day: number;
}): Promise<Notice | null> {
  const recipient = normalizeGroupId(input.recipientUserId);
  const cheerer = normalizeGroupId(input.cheererUserId);
  if (!recipient || !cheerer || recipient === cheerer) return null;

  const key = refKey(input.groupId, input.day, recipient, cheerer);
  const existingId = readRefs()[key];
  if (existingId) {
    return null;
  }

  const now = new Date().toISOString();
  const content = `'${input.cheererNickname}'님이 나의 '${input.groupName}' 인증을 응원했습니다! 👍\n${cheerLinkMeta(input.groupId, input.day)}`;
  const notice: Notice = {
    id: crypto.randomUUID(),
    title: "응원 알림",
    content,
    tag: CHEER_NOTICE_TAG,
    is_active: true,
    user_id: recipient,
    created_at: now,
  };

  try {
    const { data, error } = await supabase
      .from("notices")
      .insert({
        id: notice.id,
        user_id: notice.user_id,
        title: notice.title,
        content: notice.content,
        tag: notice.tag,
        is_active: true,
        created_at: now,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      console.error("cheer notice insert failed", error);
      return notice;
    }

    const saved = (data ?? notice) as Notice;
    saveRef(key, saved.id);
    return saved;
  } catch (error) {
    console.error("cheer notice insert failed", error);
    saveRef(key, notice.id);
    return notice;
  }
}

export async function revokeCheerNotice(input: {
  groupId: string;
  day: number;
  targetUserId: string;
  cheererUserId: string;
}) {
  const key = refKey(
    input.groupId,
    input.day,
    input.targetUserId,
    input.cheererUserId,
  );
  const noticeId = popRef(key);
  if (!noticeId) return;

  try {
    const { error: deleteError } = await supabase
      .from("notices")
      .delete()
      .eq("id", noticeId);

    if (deleteError) {
      await supabase
        .from("notices")
        .update({ is_active: false })
        .eq("id", noticeId);
    }
  } catch (error) {
    console.error("cheer notice revoke failed", error);
  }
}
