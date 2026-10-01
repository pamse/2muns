import {
  isCompletedGroup,
  isCompletedGroupStatus,
  isEndedGroupStatus,
  type Group,
} from "@/app/data";
import { addDaysToKey, kstMidnightMs, localDateKey } from "@/lib/dates";
import { CHALLENGE_TOTAL_DAYS } from "@/lib/challengeWeek";

export const COMPLETION_GRACE_MS = 24 * 60 * 60 * 1000;

/** Day 66 KST 0시 (started_at 기준 fallback) */
export function estimatedChallengeCompletionMs(
  startedAt: string | null | undefined,
): number | null {
  if (!startedAt?.trim()) return null;
  const startKey = localDateKey(startedAt);
  if (!startKey) return null;
  const day66Key = addDaysToKey(startKey, CHALLENGE_TOTAL_DAYS - 1);
  return kstMidnightMs(day66Key);
}

export function resolveGroupCompletedAtMs(group: Pick<
  Group,
  "completedAt" | "startedAt" | "dbStatus"
>): number | null {
  const explicit = group.completedAt?.trim();
  if (explicit) {
    const parsed = Date.parse(explicit);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (!isCompletedGroupStatus(group.dbStatus)) return null;
  return estimatedChallengeCompletionMs(group.startedAt);
}

export function completionGraceExpiresAtMs(
  group: Pick<Group, "completedAt" | "startedAt" | "dbStatus">,
): number | null {
  const completedAt = resolveGroupCompletedAtMs(group);
  if (completedAt == null) return null;
  return completedAt + COMPLETION_GRACE_MS;
}

export function isWithinCompletionGracePeriod(
  group: Pick<Group, "completedAt" | "startedAt" | "dbStatus">,
  now = Date.now(),
): boolean {
  if (!isCompletedGroupStatus(group.dbStatus)) return false;
  const expiresAt = completionGraceExpiresAtMs(group);
  if (expiresAt == null) return false;
  const completedAt = resolveGroupCompletedAtMs(group)!;
  return now >= completedAt && now < expiresAt;
}

/** 내 모임 / 멤버십 목록에 남길지 (진행 중 + 완주 후 24h) */
export function isEligibleForMyGroupsList(group: Group, now = Date.now()): boolean {
  if (!isEndedGroupStatus(group.dbStatus)) return true;
  if (isCompletedGroup(group) || isCompletedGroupStatus(group.dbStatus)) {
    return isWithinCompletionGracePeriod(group, now);
  }
  return false;
}

/** 참여 슬롯(3~4개) 제한에 포함할 활성 모임 */
export function countsTowardJoinLimit(group: Group, now = Date.now()): boolean {
  if (!isEligibleForMyGroupsList(group, now)) return false;
  return !isCompletedGroupStatus(group.dbStatus);
}
