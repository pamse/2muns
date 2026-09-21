import { ATTENDANCE_LIVES } from "@/app/AttendanceStrip";
import { normalizeGroupId } from "@/app/data";
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

export const SOS_HEART_PACKAGES = [
  { id: "sos-1", quantity: 1, priceLabel: "₩1,500", title: "SOS 하트 1개" },
  { id: "sos-3", quantity: 3, priceLabel: "₩3,300", title: "기본 충전팩 3개" },
  { id: "sos-5", quantity: 5, priceLabel: "₩4,900", title: "완주 보장팩 5개" },
] as const;

function isHeartColumnMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string };
  const msg = (record.message ?? "").toLowerCase();
  return (
    record.code === "PGRST204" ||
    record.code === "42703" ||
    msg.includes("hearts_remaining") ||
    msg.includes("member_status")
  );
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

export function graceRemainingMs(expulsionWarningAt: string | null, nowMs = Date.now()): number {
  if (!expulsionWarningAt) return GRACE_PERIOD_MS;
  const started = new Date(expulsionWarningAt).getTime();
  if (Number.isNaN(started)) return 0;
  return Math.max(0, GRACE_PERIOD_MS - (nowMs - started));
}

export function formatGraceCountdown(ms: number): string {
  const totalMinutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}분`;
  return `${hours}시간 ${minutes}분`;
}

export async function fetchMemberHeartState(
  groupId: string,
  userId: string,
): Promise<MemberHeartState | null> {
  const gid = normalizeGroupId(groupId);
  const uid = normalizeGroupId(userId);
  if (!gid || !uid) return null;

  const { data, error } = await supabase
    .from("group_members")
    .select(
      "hearts_remaining, hearts_purchased_count, used_paid_heart, expulsion_warning_at, member_status",
    )
    .eq("group_id", groupId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (isHeartColumnMissing(error)) return null;
    console.error("fetchMemberHeartState failed", error);
    return null;
  }
  if (!data) return null;

  const row = data as {
    hearts_remaining?: number;
    hearts_purchased_count?: number;
    used_paid_heart?: boolean;
    expulsion_warning_at?: string | null;
    member_status?: string | null;
  };

  const statusRaw = (row.member_status ?? "active").trim().toLowerCase();
  const status: MemberHeartStatus =
    statusRaw === "warning" || statusRaw === "kicked" ? statusRaw : "active";

  return {
    heartsRemaining: Math.max(0, row.hearts_remaining ?? ATTENDANCE_LIVES),
    heartsPurchasedCount: Math.max(0, row.hearts_purchased_count ?? 0),
    usedPaidHeart: Boolean(row.used_paid_heart),
    expulsionWarningAt: row.expulsion_warning_at ?? null,
    status,
  };
}

export async function syncMemberHeartState(input: {
  groupId: string;
  userId: string;
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
    return {
      heartsRemaining,
      heartsPurchasedCount: 0,
      usedPaidHeart: false,
      expulsionWarningAt: null,
      status: heartsRemaining <= 0 ? "warning" : "active",
    };
  }

  if (current.status === "kicked") {
    return current;
  }

  const heartsRemaining = computeHeartsRemaining(
    input.missCount,
    input.pointHeartBonus,
    current.heartsPurchasedCount,
  );

  let status: MemberHeartStatus = current.status;
  let expulsionWarningAt = current.expulsionWarningAt;

  if (heartsRemaining > 0) {
    status = "active";
    expulsionWarningAt = null;
  } else if (status === "active") {
    status = "warning";
    expulsionWarningAt = new Date().toISOString();
  }

  const patch = {
    hearts_remaining: heartsRemaining,
    member_status: status,
    expulsion_warning_at: expulsionWarningAt,
  };

  const { error } = await supabase
    .from("group_members")
    .update(patch)
    .eq("group_id", input.groupId)
    .eq("user_id", input.userId);

  if (error && !isHeartColumnMissing(error)) {
    console.error("syncMemberHeartState update failed", error);
  }

  return {
    ...current,
    heartsRemaining,
    status,
    expulsionWarningAt,
  };
}

export async function mockPurchaseSosHearts(input: {
  groupId: string;
  userId: string;
  quantity: number;
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

  const approved =
    typeof window !== "undefined" &&
    window.confirm(
      `[테스트 결제] SOS 하트 ${quantity}개를 충전하시겠습니까?\n(실제 결제는 연동되지 않았습니다.)`,
    );
  if (!approved) {
    return { ok: false, message: "결제가 취소되었습니다." };
  }

  const heartsRemaining = current.heartsRemaining + quantity;
  const patch = {
    hearts_remaining: heartsRemaining,
    hearts_purchased_count: nextPurchased,
    used_paid_heart: true,
    member_status: "active" as const,
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

export async function processGraceExpulsion(input: {
  groupId: string;
  userId: string;
  groupName: string;
}): Promise<boolean> {
  const state = await fetchMemberHeartState(input.groupId, input.userId);
  if (!state || state.status !== "warning" || !state.expulsionWarningAt) {
    return false;
  }
  if (graceRemainingMs(state.expulsionWarningAt) > 0) {
    return false;
  }

  const { error: kickError } = await supabase
    .from("group_members")
    .update({ member_status: "kicked" })
    .eq("group_id", input.groupId)
    .eq("user_id", input.userId);

  if (kickError && !isHeartColumnMissing(kickError)) {
    console.error("processGraceExpulsion kick update failed", kickError);
  }

  await supabase.from("group_members").delete().eq("group_id", input.groupId).eq("user_id", input.userId);

  const title = `[${input.groupName}] 강제 퇴장 완료`;
  const content =
    "24시간의 유예 기간 동안 하트 충전이 확인되지 않아 모임에서 퇴장 처리되었습니다.";

  try {
    await supabase.from("notices").insert({
      user_id: input.userId,
      title,
      content,
      tag: "penalty",
      is_active: true,
    });
  } catch (error) {
    console.error("expulsion notice insert failed", error);
  }

  return true;
}

/** 완주 뱃지: 유료 하트 미사용 시 골드 */
export function isGoldCompletionBadge(state: MemberHeartState | null): boolean {
  if (!state) return true;
  return !state.usedPaidHeart;
}
