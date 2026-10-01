import { isCompletedGroup, type Group } from "@/app/data";
import { isWithinCompletionGracePeriod } from "@/lib/groupCompletionGrace";
import { isWithinWeekDownloadWindow } from "@/lib/weekVideoRetention";

export const CHALLENGE_TOTAL_DAYS = 66;
export const CHALLENGE_WEEKS = 10;

/** 1~9주차: 7일, 10주차: Day 64~66 (3일) */
export function weekChallengeDayRange(
  week: number,
  totalDays = CHALLENGE_TOTAL_DAYS,
): { fromDay: number; toDay: number } {
  const w = Math.max(1, Math.min(CHALLENGE_WEEKS, Math.floor(week)));
  const fromDay = (w - 1) * 7 + 1;
  const toDay = Math.min(w * 7, totalDays);
  return { fromDay, toDay };
}

export function expectedDaysInWeek(week: number, totalDays = CHALLENGE_TOTAL_DAYS) {
  const { fromDay, toDay } = weekChallengeDayRange(week, totalDays);
  return Math.max(0, toDay - fromDay + 1);
}

function verifiedDaysInRange(
  verifiedDays: ReadonlySet<number> | Iterable<number>,
  fromDay: number,
  toDay: number,
) {
  const set =
    verifiedDays instanceof Set ? verifiedDays : new Set(verifiedDays);
  let count = 0;
  for (let day = fromDay; day <= toDay; day += 1) {
    if (set.has(day)) count += 1;
  }
  return count;
}

export function hasVerifiedDay(
  verifiedDays: ReadonlySet<number> | Iterable<number>,
  day: number,
) {
  const set =
    verifiedDays instanceof Set ? verifiedDays : new Set(verifiedDays);
  return set.has(day);
}

export function canDownloadWeekVideo(input: {
  week: number;
  verifiedDays: ReadonlySet<number> | Iterable<number>;
  totalDays?: number;
  hasCompletedDay66?: boolean;
  isGroupCompleted?: boolean;
  startedAt?: string | null;
  now?: number;
  groupForGrace?: Pick<Group, "completedAt" | "startedAt" | "dbStatus"> | null;
}) {
  const total = input.totalDays ?? CHALLENGE_TOTAL_DAYS;
  const now = input.now ?? Date.now();
  const week = Math.max(1, Math.min(CHALLENGE_WEEKS, Math.floor(input.week)));
  const { fromDay, toDay } = weekChallengeDayRange(week, total);
  const weekDaysVerifiedCount = verifiedDaysInRange(
    input.verifiedDays,
    fromDay,
    toDay,
  );
  const completedDay66 =
    input.hasCompletedDay66 ??
    hasVerifiedDay(input.verifiedDays, total);

  const meetsVerification =
    week === CHALLENGE_WEEKS
      ? completedDay66 ||
        weekDaysVerifiedCount >= expectedDaysInWeek(week, total)
      : weekDaysVerifiedCount >= 7;

  if (!meetsVerification) return false;

  const startedAt = input.groupForGrace?.startedAt ?? input.startedAt;

  if (week === CHALLENGE_WEEKS && input.isGroupCompleted && input.groupForGrace) {
    return isWithinCompletionGracePeriod(input.groupForGrace, now);
  }

  return isWithinWeekDownloadWindow(startedAt, week, now, total);
}

export function isGroupCompletedForWeekDownload(group: Group) {
  return isCompletedGroup(group);
}
