import type { Group } from "@/app/data";

/** DB `groups.status` — 1명만 남은 뒤 특별 추가 모집(레이스 started_at 유지) */
export const GROUP_STATUS_RECRUITING_SOLO = "recruiting_solo";

export function isSoloEmergencyRecruit(group: Group): boolean {
  const status = (group.dbStatus ?? "").trim().toLowerCase();
  if (status === GROUP_STATUS_RECRUITING_SOLO) {
    return true;
  }
  return (
    status === "recruiting" &&
    Boolean(group.startedAt) &&
    group.members.length === 1
  );
}

/** @deprecated use isSoloEmergencyRecruit */
export function isMidRaceJoinOpen(group: Group): boolean {
  return isSoloEmergencyRecruit(group);
}

/** 모집 중 탭 노출 대상 */
export function isJoinableTabGroup(group: Group): boolean {
  return group.filter === "joinable";
}

/** 달리는 중 탭: 2명 이상 순항 중 */
export function isRunningTabGroup(group: Group): boolean {
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
  if (group.filter === "joinable") return true;
  return false;
}
