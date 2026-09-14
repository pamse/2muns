import type { Group } from "@/app/data";
import { hasRaceStarted } from "@/app/data";

const MS_24H = 24 * 60 * 60 * 1000;

export function isAdditionalRecruitingActive(
  group: Pick<Group, "additionalRecruitingUntil">,
  now = Date.now(),
): boolean {
  const raw = group.additionalRecruitingUntil;
  if (!raw) return false;
  const until = new Date(raw).getTime();
  return Number.isFinite(until) && until > now;
}

/** 레이스 진행 중 + 24h 추가 모집 창 */
export function isMidRaceJoinOpen(group: Group, now = Date.now()): boolean {
  return hasRaceStarted(group) && isAdditionalRecruitingActive(group, now);
}

export function additionalRecruitingEndsAt(now = Date.now()) {
  return new Date(now + MS_24H).toISOString();
}

export function formatRecruitingTimeLeft(
  untilIso: string | null | undefined,
  now = Date.now(),
): string | null {
  if (!untilIso) return null;
  const ms = new Date(untilIso).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const totalMin = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function canGuestJoinGroup(group: Group, isMember: boolean, now = Date.now()): boolean {
  if (isMember) return true;
  if (group.filter === "joinable") return true;
  if (isMidRaceJoinOpen(group, now)) return true;
  return false;
}
