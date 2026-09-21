import { ATTENDANCE_LIVES } from "@/app/AttendanceStrip";
import { isGroupOwner, normalizeGroupId, type Group } from "@/app/data";
import { quitChallengeGroup, type QuitChallengeResult } from "@/lib/groups";
import { supabase } from "@/lib/supabase";

export const GRACE_PERIOD_MS = 86_400_000;
export const MAX_SOS_HEARTS_PER_CHALLENGE = 5;

export type MemberHeartStatus = "active" | "warning" | "kicked";

export type MemberHeartState = {
  heartsRemaining: number;
  heartsPurchasedCount: number;
  usedPaidHeart: boolean;
  expulsionWarningAt: string | null;
  status: MemberHeartStatus;
};

const GRACE_NOTICE_STORAGE_PREFIX = "muns:grace-warning-notice:";
const EXPULSION_NOTICE_STORAGE_PREFIX = "muns:expulsion-notice:";

function graceNoticeStorageKey(groupId: string, userId: string) {
  return `${GRACE_NOTICE_STORAGE_PREFIX}${normalizeGroupId(groupId)}:${normalizeGroupId(userId)}`;
}

function expulsionNoticeStorageKey(
  groupId: string,
  userId: string,
  warningAt: string,
) {
  return `${EXPULSION_NOTICE_STORAGE_PREFIX}${normalizeGroupId(groupId)}:${normalizeGroupId(userId)}:${warningAt}`;
}

function isHeartColumnMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string; status?: number };
  const msg = (record.message ?? "").toLowerCase();
  return (
    record.code === "PGRST204" ||
    record.code === "42703" ||
    record.code === "22P02" ||
    record.status === 400 ||
    msg.includes("bad request") ||
    msg.includes("invalid input syntax") ||
    msg.includes("member_status") ||
    msg.includes("hearts_remaining") ||
    msg.includes("expulsion_warning_at") ||
    (msg.includes("status") && msg.includes("column"))
  );
}

/** DB 조회 실패 시 SOS 모달 UI용 기본값 */
export const SOS_MODAL_FALLBACK_STATE: MemberHeartState = {
  heartsRemaining: 0,
  heartsPurchasedCount: 0,
  usedPaidHeart: false,
  expulsionWarningAt: null,
  status: "warning",
};

function readStatus(row: {
  status?: string | null;
  member_status?: string | null;
}): MemberHeartStatus {
  const raw = (row.status ?? row.member_status ?? "active").trim().toLowerCase();
  if (raw === "warning" || raw === "kicked") return raw;
  return "active";
}

export function computeHeartsRemaining(
  missCount: number,
  pointHeartBonus: number,
  heartsPurchasedCount: number,
): number {
  const pool =
    ATTENDANCE_LIVES + Math.max(0, pointHeartBonus) + Math.max(0, heartsPurchasedCount);
  return Math.max(0, pool - Math.max(0, missCount));
}

export function graceRemainingMs(
  expulsionWarningAt: string | null,
  nowMs = Date.now(),
  fallbackStartMs?: number | null,
): number {
  let startedMs: number | null = null;
  if (expulsionWarningAt) {
    const parsed = new Date(expulsionWarningAt).getTime();
    if (!Number.isNaN(parsed)) startedMs = parsed;
  } else if (fallbackStartMs != null && !Number.isNaN(fallbackStartMs)) {
    startedMs = fallbackStartMs;
  }
  if (startedMs == null) return GRACE_PERIOD_MS;
  const remaining = GRACE_PERIOD_MS - (nowMs - startedMs);
  return Math.min(Math.max(0, remaining), GRACE_PERIOD_MS);
}

export function parseGraceCountdownMs(ms: number): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  if (ms <= 0) return { hours: 0, minutes: 0, seconds: 0 };
  const totalSec = Math.floor(ms / 1000);
  return {
    hours: Math.floor(totalSec / 3600),
    minutes: Math.floor((totalSec % 3600) / 60),
    seconds: totalSec % 60,
  };
}

/** 시·분·초 — 조건 없이 항상 `{n}시간 {n}분 {n}초` */
export function formatGraceCountdownWithSeconds(ms: number): string {
  const { hours, minutes, seconds } = parseGraceCountdownMs(ms);
  return `${hours}시간 ${minutes}분 ${seconds}초`;
}

export function formatGraceCountdown(ms: number): string {
  return formatGraceCountdownWithSeconds(ms);
}

export async function fetchMemberHeartState(
  groupId: string,
  userId: string,
): Promise<MemberHeartState | null> {
  if (!groupId?.trim() || !userId?.trim()) return null;

  type HeartRow = {
    hearts_remaining?: number;
    hearts_purchased_count?: number;
    expulsion_warning_at?: string | null;
    status?: string | null;
    member_status?: string | null;
  };

  const columnSets = [
    "hearts_remaining, hearts_purchased_count, expulsion_warning_at, status",
    "hearts_remaining, hearts_purchased_count, expulsion_warning_at",
    "hearts_remaining, hearts_purchased_count",
  ] as const;

  let data: HeartRow | null = null;
  for (const columns of columnSets) {
    const result = await supabase
      .from("group_members")
      .select(columns)
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!result.error && result.data) {
      data = result.data as HeartRow;
      break;
    }
    if (result.error && !isHeartColumnMissing(result.error)) {
      console.error("fetchMemberHeartState failed", result.error);
      return null;
    }
  }

  if (!data) return null;

  return {
    heartsRemaining: Math.max(0, data.hearts_remaining ?? ATTENDANCE_LIVES),
    heartsPurchasedCount: Math.max(0, data.hearts_purchased_count ?? 0),
    usedPaidHeart: false,
    expulsionWarningAt: data.expulsion_warning_at ?? null,
    status: readStatus(data),
  };
}

async function insertGraceWarningNotice(input: {
  userId: string;
  groupId: string;
  groupName: string;
}) {
  const storageKey = graceNoticeStorageKey(input.groupId, input.userId);
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage.getItem(storageKey) === "1") return;
    } catch {
      // ignore
    }
  }

  const title = `[${input.groupName}] 출석 기회 소진 (24시간 유예)`;
  const content =
    "출석 기회가 모두 소진되었습니다! 24시간 이내에 SOS 하트를 충전하지 않으면 모임에서 강제 퇴장 처리됩니다.";

  const { error } = await supabase.from("notices").insert({
    user_id: input.userId,
    title,
    content,
    tag: "warning",
    is_active: true,
  });

  if (error) {
    console.error("grace warning notice insert failed", error);
    return;
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
  }
}

function clearGraceNoticeMarker(groupId: string, userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(graceNoticeStorageKey(groupId, userId));
  } catch {
    // ignore
  }
}

/**
 * 하트 0 + active → warning 전환, expulsion_warning_at 기록, notices insert
 * (이미 warning/kicked이면 알림·시각 재기록하지 않음)
 */
export async function transitionToGraceIfNeeded(input: {
  groupId: string;
  userId: string;
  groupName: string;
  heartsRemaining: number;
  current: MemberHeartState;
}): Promise<MemberHeartState> {
  if (input.current.status === "kicked") {
    return input.current;
  }

  if (input.heartsRemaining > 0) {
    if (input.current.status === "warning") {
      clearGraceNoticeMarker(input.groupId, input.userId);
    }
    const patch = {
      hearts_remaining: input.heartsRemaining,
      status: "active" as const,
      expulsion_warning_at: null,
    };
    await supabase
      .from("group_members")
      .update(patch)
      .eq("group_id", input.groupId)
      .eq("user_id", input.userId);
    return {
      ...input.current,
      heartsRemaining: input.heartsRemaining,
      status: "active",
      expulsionWarningAt: null,
    };
  }

  if (input.current.status === "warning" && input.current.expulsionWarningAt) {
    const patch = { hearts_remaining: 0 };
    await supabase
      .from("group_members")
      .update(patch)
      .eq("group_id", input.groupId)
      .eq("user_id", input.userId);
    return { ...input.current, heartsRemaining: 0 };
  }

  const now = new Date().toISOString();
  const patch = {
    hearts_remaining: 0,
    status: "warning" as const,
    expulsion_warning_at: now,
  };

  const { error } = await supabase
    .from("group_members")
    .update(patch)
    .eq("group_id", input.groupId)
    .eq("user_id", input.userId);

  if (error && !isHeartColumnMissing(error)) {
    console.error("transitionToGraceIfNeeded update failed", error);
  }

  await insertGraceWarningNotice(input);

  return {
    ...input.current,
    heartsRemaining: 0,
    status: "warning",
    expulsionWarningAt: now,
  };
}

/** MY 탭 진입·출석 확인 시: hearts_remaining 반영 + 0이면 유예 전환 */
export async function applyHeartAttendanceCheck(input: {
  groupId: string;
  userId: string;
  groupName: string;
  missCount: number;
  pointHeartBonus: number;
}): Promise<MemberHeartState | null> {
  const current = await fetchMemberHeartState(input.groupId, input.userId);
  if (!current) {
    const heartsRemaining = computeHeartsRemaining(
      input.missCount,
      input.pointHeartBonus,
      0,
    );
    if (heartsRemaining > 0) {
      return {
        heartsRemaining,
        heartsPurchasedCount: 0,
        usedPaidHeart: false,
        expulsionWarningAt: null,
        status: "active",
      };
    }
    return transitionToGraceIfNeeded({
      groupId: input.groupId,
      userId: input.userId,
      groupName: input.groupName,
      heartsRemaining: 0,
      current: {
        heartsRemaining: 0,
        heartsPurchasedCount: 0,
        usedPaidHeart: false,
        expulsionWarningAt: null,
        status: "active",
      },
    });
  }

  const heartsRemaining = computeHeartsRemaining(
    input.missCount,
    input.pointHeartBonus,
    current.heartsPurchasedCount,
  );

  return transitionToGraceIfNeeded({
    groupId: input.groupId,
    userId: input.userId,
    groupName: input.groupName,
    heartsRemaining,
    current,
  });
}

// --- 2·3단계용 (1단계에서는 MyTab에서 호출하지 않음) ---

export const SOS_HEART_PACKAGES = [
  { id: "sos-1", quantity: 1, priceLabel: "₩1,500", title: "SOS 하트 1개" },
  { id: "sos-3", quantity: 3, priceLabel: "₩3,300", title: "기본 충전팩 3개" },
  { id: "sos-5", quantity: 5, priceLabel: "₩4,900", title: "완주 보장팩 5개" },
] as const;

export async function mockPurchaseSosHearts(input: {
  groupId: string;
  userId: string;
  quantity: number;
  /** UI에서 confirm 후 호출 시 중복 confirm 방지 */
  skipConfirm?: boolean;
}): Promise<{ ok: boolean; message: string; state?: MemberHeartState }> {
  const quantity = Math.max(1, Math.floor(input.quantity));
  const current = await fetchMemberHeartState(input.groupId, input.userId);
  if (!current) {
    return { ok: false, message: "참여 정보를 찾을 수 없습니다." };
  }
  if (current.status === "kicked") {
    return { ok: false, message: "이미 퇴장 처리된 챌린지입니다." };
  }

  const nextPurchased = current.heartsPurchasedCount + quantity;
  if (nextPurchased > MAX_SOS_HEARTS_PER_CHALLENGE) {
    return {
      ok: false,
      message: `한 챌린지당 최대 ${MAX_SOS_HEARTS_PER_CHALLENGE}개까지만 충전할 수 있습니다.`,
    };
  }

  if (!input.skipConfirm) {
    const approved =
      typeof window !== "undefined" &&
      window.confirm(
        `[테스트 결제] SOS 하트 ${quantity}개를 충전하시겠습니까?\n(실제 결제는 연동되지 않았습니다.)`,
      );
    if (!approved) {
      return { ok: false, message: "결제가 취소되었습니다." };
    }
  }

  const heartsRemaining = current.heartsRemaining + quantity;
  clearGraceNoticeMarker(input.groupId, input.userId);
  const patch = {
    hearts_remaining: heartsRemaining,
    hearts_purchased_count: nextPurchased,
    status: "active" as const,
    expulsion_warning_at: null,
  };

  const { error } = await supabase
    .from("group_members")
    .update(patch)
    .eq("group_id", input.groupId)
    .eq("user_id", input.userId);

  if (error) {
    if (isHeartColumnMissing(error)) {
      return {
        ok: false,
        message: "하트 충전을 위해 DB 마이그레이션(challenge_hearts_grace.sql)이 필요합니다.",
      };
    }
    return { ok: false, message: error.message || "충전에 실패했습니다." };
  }

  return {
    ok: true,
    message: `SOS 하트 ${quantity}개가 충전되었습니다.`,
    state: {
      heartsRemaining,
      heartsPurchasedCount: nextPurchased,
      usedPaidHeart: true,
      expulsionWarningAt: null,
      status: "active",
    },
  };
}

async function insertExpulsionNotice(input: {
  userId: string;
  groupId: string;
  groupName: string;
  warningAt: string;
}) {
  const storageKey = expulsionNoticeStorageKey(
    input.groupId,
    input.userId,
    input.warningAt,
  );
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage.getItem(storageKey) === "1") return;
    } catch {
      // ignore
    }
  }

  const title = `[${input.groupName}] 강제 퇴장 완료`;
  const content =
    "24시간의 유예 기간 동안 SOS 하트 충전이 확인되지 않아 모임에서 퇴장 처리되었습니다.";

  const { error } = await supabase.from("notices").insert({
    user_id: input.userId,
    title,
    content,
    tag: "penalty",
    is_active: true,
  });

  if (error) {
    console.error("expulsion notice insert failed", error);
    return;
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // ignore
    }
  }
}

export type GraceExpulsionResult = {
  expelled: boolean;
  groupId?: string;
  quitResult?: QuitChallengeResult;
};

/** 24h 유예 만료 시 강퇴 + notices (동일 warningAt 건당 알림 1회) */
export async function processGraceExpulsion(input: {
  groupId: string;
  userId: string;
  groupName: string;
  group?: Pick<Group, "id" | "ownerId" | "createdBy" | "members">;
}): Promise<GraceExpulsionResult> {
  const state = await fetchMemberHeartState(input.groupId, input.userId);
  if (!state) {
    return { expelled: false };
  }
  if (state.status === "kicked") {
    return { expelled: false };
  }
  if (state.status !== "warning" || !state.expulsionWarningAt) {
    return { expelled: false };
  }
  if (graceRemainingMs(state.expulsionWarningAt) > 0) {
    return { expelled: false };
  }

  const warningAt = state.expulsionWarningAt;

  const { error: kickMarkError } = await supabase
    .from("group_members")
    .update({ status: "kicked" })
    .eq("group_id", input.groupId)
    .eq("user_id", input.userId);
  if (kickMarkError && !isHeartColumnMissing(kickMarkError)) {
    console.error("processGraceExpulsion kick mark failed", kickMarkError);
  }

  const { data: memberRows, error: membersError } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", input.groupId);

  if (membersError) {
    console.error("processGraceExpulsion members fetch failed", membersError);
    return { expelled: false };
  }

  const remaining = (memberRows ?? []).filter((row) => row.user_id !== input.userId);
  let isOwner = false;
  if (input.group) {
    isOwner = isGroupOwner(input.group as Group, input.userId);
  } else {
    const { data: groupRow } = await supabase
      .from("groups")
      .select("owner_id")
      .eq("id", input.groupId)
      .maybeSingle();
    isOwner =
      normalizeGroupId(groupRow?.owner_id) === normalizeGroupId(input.userId);
  }

  let quitResult: QuitChallengeResult;
  try {
    quitResult = await quitChallengeGroup({
      groupId: input.groupId,
      userId: input.userId,
      isOwner,
      remainingMemberCount: remaining.length,
    });
  } catch (error) {
    console.error("processGraceExpulsion quit failed", error);
    return { expelled: false };
  }

  await insertExpulsionNotice({
    userId: input.userId,
    groupId: input.groupId,
    groupName: input.groupName,
    warningAt,
  });

  clearGraceNoticeMarker(input.groupId, input.userId);
  return { expelled: true, groupId: input.groupId, quitResult };
}

export async function sweepGraceExpulsions(input: {
  userId: string;
  groups: Array<Pick<Group, "id" | "name" | "ownerId" | "createdBy" | "members">>;
}): Promise<GraceExpulsionResult[]> {
  const results: GraceExpulsionResult[] = [];
  for (const group of input.groups) {
    const result = await processGraceExpulsion({
      groupId: group.id,
      userId: input.userId,
      groupName: group.name,
      group,
    });
    if (result.expelled) {
      results.push({ ...result, groupId: group.id });
    }
  }
  return results;
}

export function isGoldCompletionBadge(state: MemberHeartState | null): boolean {
  if (!state) return true;
  return !state.usedPaidHeart;
}

/** @deprecated use applyHeartAttendanceCheck */
export async function syncMemberHeartState(input: {
  groupId: string;
  userId: string;
  missCount: number;
  pointHeartBonus: number;
  groupName?: string;
}): Promise<MemberHeartState | null> {
  return applyHeartAttendanceCheck({
    ...input,
    groupName: input.groupName ?? "모임",
  });
}
