import type { Group } from "@/app/data";
import { normalizeGroupId } from "@/app/data";
import { challengeDayFromStart } from "@/lib/groups";
import { fetchUserVerificationDays } from "@/lib/verifications";

export const DEBUG_CHALLENGE_BADGE =
  process.env.NEXT_PUBLIC_DEBUG_CHALLENGE_BADGE === "1";

export function debugChallengeBadge(message: string, payload?: Record<string, unknown>) {
  if (!DEBUG_CHALLENGE_BADGE) return;
  console.info(`[challenge-badge] ${message}`, payload ?? "");
}

/** UI·인증 판별에 쓸 현재 챌린지 일차 (started_at 우선, group.day는 보조) */
export function resolveCurrentChallengeDay(group: Pick<Group, "day" | "startedAt" | "raceStatus" | "dbStatus">) {
  if (group.startedAt) {
    return Math.max(1, challengeDayFromStart(group.startedAt, group.raceStatus === "started" ? "started" : group.dbStatus));
  }
  return Math.max(1, group.day);
}

export function groupForChallengeBadge(group: Group): Group {
  const day = resolveCurrentChallengeDay(group);
  return day === group.day ? group : { ...group, day };
}

/** 해당 일차에 본인 인증 row가 있는지 (day 컬럼 기준) */
export async function isUserVerifiedOnChallengeDay(
  groupId: string,
  userId: string,
  challengeDay: number,
): Promise<boolean> {
  const gid = normalizeGroupId(groupId);
  const uid = normalizeGroupId(userId);
  if (!gid || !uid || challengeDay < 1) return false;

  const days = await fetchUserVerificationDays(gid, uid);
  const verified = days.includes(challengeDay);

  debugChallengeBadge("isUserVerifiedOnChallengeDay", {
    groupId: gid,
    userId: uid,
    challengeDay,
    verifiedDays: days,
    verified,
  });

  return verified;
}
