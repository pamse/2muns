import { MAX_JOINED_GROUPS, normalizeGroupId } from "@/app/data";
import { localDateKey } from "@/lib/dates";
import { supabase } from "@/lib/supabase";

/** 포인트 획득 규칙 */
export const POINT_EARN = {
  DAILY_VERIFY: 10,
  STREAK_7: 50,
  STREAK_21: 150,
  STREAK_42: 300,
  COMPLETE_66: 1000,
  EMOJI_FEEDBACK: 5,
} as const;

/** 포인트 소비 항목 */
export const POINT_SPEND = {
  HEART_RECHARGE: 300,
  SLOT_EXPANSION: 500,
} as const;

export const EMOJI_FEEDBACK_DAILY_LIMIT = 1;
export const SLOT_EXPANSION_AMOUNT = 1;
export const EXPANDED_MAX_JOINED_GROUPS = MAX_JOINED_GROUPS + SLOT_EXPANSION_AMOUNT;

export const POINTS_UPDATED_EVENT = "muns:points-updated";

const STORAGE_PREFIX = "muns:points:";

export type UserPointsSnapshot = {
  points: number;
  extraGroupSlots: number;
  heartBonusByGroup: Record<string, number>;
  awardedKeys: string[];
  emojiFeedbackDate: string;
  emojiFeedbackCount: number;
};

export type PointAwardResult = {
  totalAwarded: number;
  messages: string[];
  newBalance: number;
};

function defaultSnapshot(initialPoints = 0): UserPointsSnapshot {
  return {
    points: initialPoints,
    extraGroupSlots: 0,
    heartBonusByGroup: {},
    awardedKeys: [],
    emojiFeedbackDate: "",
    emojiFeedbackCount: 0,
  };
}

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${normalizeGroupId(userId)}`;
}

function readLocal(userId: string): UserPointsSnapshot | null {
  if (typeof window === "undefined" || !userId) return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<UserPointsSnapshot>;
    return {
      points: Number.isFinite(parsed.points) ? Number(parsed.points) : 0,
      extraGroupSlots: parsed.extraGroupSlots ? 1 : 0,
      heartBonusByGroup: parsed.heartBonusByGroup ?? {},
      awardedKeys: Array.isArray(parsed.awardedKeys) ? parsed.awardedKeys : [],
      emojiFeedbackDate: parsed.emojiFeedbackDate ?? "",
      emojiFeedbackCount: Number(parsed.emojiFeedbackCount) || 0,
    };
  } catch {
    return null;
  }
}

function writeLocal(userId: string, snapshot: UserPointsSnapshot) {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
}

export function dispatchPointsUpdated(userId: string, snapshot: UserPointsSnapshot) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(POINTS_UPDATED_EVENT, {
      detail: { userId, snapshot },
    }),
  );
}

function persist(userId: string, snapshot: UserPointsSnapshot) {
  writeLocal(userId, snapshot);
  dispatchPointsUpdated(userId, snapshot);
  void syncSnapshotToSupabase(userId, snapshot);
}

function hasAwarded(snapshot: UserPointsSnapshot, key: string) {
  return snapshot.awardedKeys.includes(key);
}

function markAwarded(snapshot: UserPointsSnapshot, key: string) {
  if (snapshot.awardedKeys.includes(key)) return snapshot;
  return {
    ...snapshot,
    awardedKeys: [...snapshot.awardedKeys, key],
  };
}

function addPoints(snapshot: UserPointsSnapshot, amount: number, key: string) {
  if (amount <= 0 || hasAwarded(snapshot, key)) {
    return { snapshot, awarded: 0 };
  }
  const next = markAwarded(snapshot, key);
  next.points = Math.max(0, next.points + amount);
  return { snapshot: next, awarded: amount };
}

export function computeStreak(verifiedDays: number[], throughDay: number) {
  const set = new Set(verifiedDays);
  let streak = 0;
  for (let day = throughDay; day >= 1; day -= 1) {
    if (set.has(day)) streak += 1;
    else break;
  }
  return streak;
}

export function getHeartBonus(snapshot: UserPointsSnapshot, groupId: string) {
  return snapshot.heartBonusByGroup[normalizeGroupId(groupId)] ?? 0;
}

export function getEffectiveMaxJoinedGroups(snapshot: UserPointsSnapshot) {
  return MAX_JOINED_GROUPS + snapshot.extraGroupSlots;
}

async function syncSnapshotToSupabase(userId: string, snapshot: UserPointsSnapshot) {
  try {
    const { error } = await supabase
      .from("users")
      .update({
        points: snapshot.points,
        extra_group_slots: snapshot.extraGroupSlots,
      })
      .eq("id", userId);
    if (error) return;

    for (const [groupId, bonus] of Object.entries(snapshot.heartBonusByGroup)) {
      if (!bonus) continue;
      await supabase.from("user_group_bonuses").upsert(
        {
          user_id: userId,
          group_id: groupId,
          heart_bonus: bonus,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,group_id" },
      );
    }
  } catch {
    // Supabase 미적용 환경 — localStorage만 사용
  }
}

async function loadFromSupabase(userId: string): Promise<Partial<UserPointsSnapshot> | null> {
  try {
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("points, extra_group_slots")
      .eq("id", userId)
      .maybeSingle();
    if (userError || !userRow) return null;

    const { data: bonusRows } = await supabase
      .from("user_group_bonuses")
      .select("group_id, heart_bonus")
      .eq("user_id", userId);

    const heartBonusByGroup: Record<string, number> = {};
    for (const row of bonusRows ?? []) {
      const gid = normalizeGroupId(row.group_id);
      if (gid && row.heart_bonus) heartBonusByGroup[gid] = row.heart_bonus;
    }

    return {
      points: userRow.points ?? 0,
      extraGroupSlots: userRow.extra_group_slots ? 1 : 0,
      heartBonusByGroup,
    };
  } catch {
    return null;
  }
}

export async function fetchUserPointsSnapshot(userId: string): Promise<UserPointsSnapshot> {
  if (!userId) return defaultSnapshot();

  const local = readLocal(userId);
  const remote = await loadFromSupabase(userId);

  if (!local && !remote) return defaultSnapshot();
  if (!local && remote) {
    const merged = {
      ...defaultSnapshot(remote.points ?? 0),
      ...remote,
      awardedKeys: [],
    } as UserPointsSnapshot;
    writeLocal(userId, merged);
    return merged;
  }
  if (local && remote) {
    const merged: UserPointsSnapshot = {
      ...local,
      points: Math.max(local.points, remote.points ?? 0),
      extraGroupSlots: Math.max(local.extraGroupSlots, remote.extraGroupSlots ?? 0),
      heartBonusByGroup: { ...remote.heartBonusByGroup, ...local.heartBonusByGroup },
    };
    writeLocal(userId, merged);
    return merged;
  }
  return local ?? defaultSnapshot();
}

export async function getUserJoinLimit(userId: string) {
  const snapshot = await fetchUserPointsSnapshot(userId);
  return getEffectiveMaxJoinedGroups(snapshot);
}

export async function awardDailyVerificationPoints(
  userId: string,
  groupId: string,
  day: number,
  verifiedDays: number[],
): Promise<PointAwardResult> {
  let snapshot = (await fetchUserPointsSnapshot(userId)) ?? defaultSnapshot();
  const messages: string[] = [];
  let totalAwarded = 0;
  const gid = normalizeGroupId(groupId);

  const dailyKey = `daily:${gid}:${day}`;
  const daily = addPoints(snapshot, POINT_EARN.DAILY_VERIFY, dailyKey);
  snapshot = daily.snapshot;
  if (daily.awarded > 0) {
    totalAwarded += daily.awarded;
    messages.push(`+${POINT_EARN.DAILY_VERIFY}P 일일 인증`);
  }

  const streak = computeStreak(verifiedDays, day);
  const streakRules: Array<{ days: number; amount: number; label: string }> = [
    { days: 7, amount: POINT_EARN.STREAK_7, label: "7일 연속" },
    { days: 21, amount: POINT_EARN.STREAK_21, label: "21일 연속" },
    { days: 42, amount: POINT_EARN.STREAK_42, label: "42일 연속" },
  ];

  for (const rule of streakRules) {
    if (streak < rule.days) continue;
    const key = `streak${rule.days}:${gid}`;
    const streakAward = addPoints(snapshot, rule.amount, key);
    snapshot = streakAward.snapshot;
    if (streakAward.awarded > 0) {
      totalAwarded += streakAward.awarded;
      messages.push(`+${rule.amount}P ${rule.label} 달성`);
    }
  }

  persist(userId, snapshot);
  return { totalAwarded, messages, newBalance: snapshot.points };
}

export async function awardEmojiFeedbackPoints(
  userId: string,
  groupId: string,
  targetUserId: string,
  day: number,
): Promise<PointAwardResult | null> {
  let snapshot = await fetchUserPointsSnapshot(userId);
  const today = localDateKey();
  if (snapshot.emojiFeedbackDate !== today) {
    snapshot = { ...snapshot, emojiFeedbackDate: today, emojiFeedbackCount: 0 };
  }
  if (snapshot.emojiFeedbackCount >= EMOJI_FEEDBACK_DAILY_LIMIT) {
    return null;
  }

  const key = `emoji:${normalizeGroupId(groupId)}:${normalizeGroupId(targetUserId)}:${day}:${today}`;
  const award = addPoints(snapshot, POINT_EARN.EMOJI_FEEDBACK, key);
  if (award.awarded <= 0) return null;

  const next = {
    ...award.snapshot,
    emojiFeedbackCount: snapshot.emojiFeedbackCount + 1,
  };
  persist(userId, next);
  return {
    totalAwarded: award.awarded,
    messages: [`+${POINT_EARN.EMOJI_FEEDBACK}P 응원 피드백`],
    newBalance: next.points,
  };
}

export async function awardCompletionPoints(
  userId: string,
  groupId: string,
): Promise<PointAwardResult | null> {
  let snapshot = await fetchUserPointsSnapshot(userId);
  const key = `complete:${normalizeGroupId(groupId)}`;
  const award = addPoints(snapshot, POINT_EARN.COMPLETE_66, key);
  if (award.awarded <= 0) return null;
  persist(userId, award.snapshot);
  return {
    totalAwarded: award.awarded,
    messages: [`+${POINT_EARN.COMPLETE_66}P 66일 완주`],
    newBalance: award.snapshot.points,
  };
}

export async function purchaseHeartRecharge(
  userId: string,
  groupId: string,
  livesLeft: number,
  maxLives: number,
): Promise<{ ok: boolean; message: string; snapshot?: UserPointsSnapshot }> {
  const snapshot = await fetchUserPointsSnapshot(userId);
  if (livesLeft >= maxLives) {
    return { ok: false, message: "하트가 이미 가득 찼습니다." };
  }
  if (snapshot.points < POINT_SPEND.HEART_RECHARGE) {
    return { ok: false, message: "포인트가 부족합니다." };
  }

  const gid = normalizeGroupId(groupId);
  const next: UserPointsSnapshot = {
    ...snapshot,
    points: snapshot.points - POINT_SPEND.HEART_RECHARGE,
    heartBonusByGroup: {
      ...snapshot.heartBonusByGroup,
      [gid]: (snapshot.heartBonusByGroup[gid] ?? 0) + 1,
    },
  };
  persist(userId, next);
  return { ok: true, message: "하트 1개가 충전되었습니다!", snapshot: next };
}

export async function purchaseSlotExpansion(
  userId: string,
): Promise<{ ok: boolean; message: string; snapshot?: UserPointsSnapshot }> {
  const snapshot = await fetchUserPointsSnapshot(userId);
  if (snapshot.extraGroupSlots >= SLOT_EXPANSION_AMOUNT) {
    return { ok: false, message: "이미 슬롯 확장권을 사용 중입니다." };
  }
  if (snapshot.points < POINT_SPEND.SLOT_EXPANSION) {
    return { ok: false, message: "포인트가 부족합니다." };
  }

  const next: UserPointsSnapshot = {
    ...snapshot,
    points: snapshot.points - POINT_SPEND.SLOT_EXPANSION,
    extraGroupSlots: SLOT_EXPANSION_AMOUNT,
  };
  persist(userId, next);
  return { ok: true, message: "모임 슬롯이 +1 확장되었습니다!", snapshot: next };
}

export function clearUserPointsCache(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  window.localStorage.removeItem(storageKey(userId));
}
