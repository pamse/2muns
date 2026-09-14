import type { Group } from "@/app/data";
import { diffCalendarDays, localDateKey } from "@/lib/dates";

/** DB `groups.status` — 1인 잔류 추가 모집(레거시 값, `recruiting`과 동일 취급) */
export const GROUP_STATUS_RECRUITING_SOLO = "recruiting_solo";

export function hasChallengeJourneyStarted(input: {
  startedAt?: string | null;
  /** 예정 시작일 (YYYY-MM-DD). DB에 없으면 생략 */
  startDate?: string | null;
  day?: number;
  now?: Date;
}): boolean {
  if (input.startedAt) {
    return true;
  }
  const startKey = (input.startDate ?? "").trim();
  if (startKey) {
    const todayKey = localDateKey(input.now ?? new Date());
    if (todayKey && diffCalendarDays(startKey, todayKey) >= 0) {
      return true;
    }
  }
  if (typeof input.day === "number" && input.day > 0) {
    return true;
  }
  return false;
}

/** 1인 + 이미 시작된 여정 + (추가 모집 status 또는 status 갱신 전) */
function isOneMemberMidRaceRecruit(input: {
  dbStatus?: string | null;
  startedAt?: string | null;
  startDate?: string | null;
  memberCount: number;
  day?: number;
}): boolean {
  if (input.memberCount !== 1) {
    return false;
  }

  if (
    !hasChallengeJourneyStarted({
      startedAt: input.startedAt,
      startDate: input.startDate,
      day: input.day,
    })
  ) {
    return false;
  }

  const status = (input.dbStatus ?? "").trim().toLowerCase();
  if (status === GROUP_STATUS_RECRUITING_SOLO || status === "recruiting") {
    return true;
  }

  if (
    input.startedAt &&
    (status === "started" || status === "ongoing" || status === "active")
  ) {
    return true;
  }

  return false;
}

/** 모집 중 탭·mapStatus — 진행 중이던 1인 추가 모집만 ongoing 대신 joinable */
export function shouldListInJoinableTab(input: {
  dbStatus?: string | null;
  startedAt?: string | null;
  startDate?: string | null;
  memberCount: number;
  day?: number;
}): boolean {
  return isOneMemberMidRaceRecruit(input);
}

export function isSoloEmergencyRecruit(group: Group): boolean {
  return isOneMemberMidRaceRecruit({
    dbStatus: group.dbStatus,
    startedAt: group.startedAt,
    startDate: group.startDate,
    memberCount: group.members.length,
    day: group.day,
  });
}

/** @deprecated use isSoloEmergencyRecruit */
export function isMidRaceJoinOpen(group: Group): boolean {
  return isSoloEmergencyRecruit(group);
}

/** 모집 중 탭 — 긴급 탑승(1인 추가 모집) + 일반 joinable */
export function isJoinableTabGroup(group: Group): boolean {
  if (isSoloEmergencyRecruit(group)) {
    return true;
  }
  return group.filter === "joinable";
}

/** 달리는 중 탭 — 1인 추가 모집 모임 완전 제외, 2명 이상만 */
export function isRunningTabGroup(group: Group): boolean {
  if (isSoloEmergencyRecruit(group)) {
    return false;
  }
  return group.filter === "ongoing" && group.members.length >= 2;
}

export function sortJoinableTabGroups(list: Group[]): Group[] {
  return [...list].sort((a, b) => {
    const aSolo = isSoloEmergencyRecruit(a) ? 1 : 0;
    const bSolo = isSoloEmergencyRecruit(b) ? 1 : 0;
    if (aSolo !== bSolo) {
      return bSolo - aSolo;
    }
    return 0;
  });
}

export function canGuestJoinGroup(group: Group, isMember: boolean): boolean {
  if (isMember) return true;
  if (isJoinableTabGroup(group)) return true;
  return false;
}
