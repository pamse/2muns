import type { Group } from "@/app/data";

/** DB `groups.status` — 1인 잔류 추가 모집(레거시 값, `recruiting`과 동일 취급) */
export const GROUP_STATUS_RECRUITING_SOLO = "recruiting_solo";

export function shouldListInJoinableTab(input: {
  dbStatus?: string | null;
  startedAt?: string | null;
  memberCount: number;
}): boolean {
  if (input.memberCount !== 1) {
    return false;
  }

  const status = (input.dbStatus ?? "").trim().toLowerCase();
  if (status === GROUP_STATUS_RECRUITING_SOLO || status === "recruiting") {
    return true;
  }

  // status 갱신 전·started_at만 남은 경우에도 1인 잔류 추가 모집으로 모집 중 탭에 노출
  if (
    input.startedAt &&
    (status === "started" || status === "ongoing" || status === "active")
  ) {
    return true;
  }

  return false;
}

export function isSoloEmergencyRecruit(group: Group): boolean {
  return shouldListInJoinableTab({
    dbStatus: group.dbStatus,
    startedAt: group.startedAt,
    memberCount: group.members.length,
  });
}

/** @deprecated use isSoloEmergencyRecruit */
export function isMidRaceJoinOpen(group: Group): boolean {
  return isSoloEmergencyRecruit(group);
}

/** 모집 중 탭 — 1인 추가 모집이 최우선( started_at 무관 ) */
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
