import type { Group } from "@/app/data";
import {
  CHALLENGE_TOTAL_DAYS,
  CHALLENGE_WEEKS,
  weekChallengeDayRange,
} from "@/lib/challengeWeek";
import { isWithinCompletionGracePeriod } from "@/lib/groupCompletionGrace";
import {
  addDaysToKey,
  challengeDayNumber,
  kstMidnightMs,
  localDateKey,
  type WeeklyShortsWindow,
} from "@/lib/dates";

/** 주차 종료 KST 0시부터 24시간 (1~9주차·10주차 Day66 동일) */
export const WEEK_VIDEO_DOWNLOAD_GRACE_MS = 86_400_000;

export function challengeDayToWeek(
  day: number,
  totalDays = CHALLENGE_TOTAL_DAYS,
): number {
  const d = Math.max(1, Math.floor(day));
  if (d >= weekChallengeDayRange(CHALLENGE_WEEKS, totalDays).fromDay) {
    return CHALLENGE_WEEKS;
  }
  return Math.min(CHALLENGE_WEEKS, Math.ceil(d / 7));
}

export function weekDownloadWindowMs(
  startedAt: string | null | undefined,
  week: number,
  totalDays = CHALLENGE_TOTAL_DAYS,
): { windowStartMs: number; expiresAtMs: number } | null {
  if (!startedAt?.trim()) return null;
  const startKey = localDateKey(startedAt);
  if (!startKey) return null;

  const w = Math.max(1, Math.min(CHALLENGE_WEEKS, Math.floor(week)));
  const { toDay } = weekChallengeDayRange(w, totalDays);
  const weekEndKey = addDaysToKey(startKey, toDay - 1);
  const windowStartMs = kstMidnightMs(weekEndKey);
  return {
    windowStartMs,
    expiresAtMs: windowStartMs + WEEK_VIDEO_DOWNLOAD_GRACE_MS,
  };
}

export function isWithinWeekDownloadWindow(
  startedAt: string | null | undefined,
  week: number,
  now = Date.now(),
  totalDays = CHALLENGE_TOTAL_DAYS,
): boolean {
  const bounds = weekDownloadWindowMs(startedAt, week, totalDays);
  if (!bounds) return false;
  return now >= bounds.windowStartMs && now < bounds.expiresAtMs;
}

/** 룸 피드: 진행 중인 주차는 재생 허용, 지난 주차는 24h 창 또는 완주 유예만 */
export function isVerificationVideoAccessible(input: {
  startedAt: string | null | undefined;
  challengeDay: number;
  currentDay: number;
  now?: number;
  totalDays?: number;
  isGroupCompleted?: boolean;
  groupForGrace?: Pick<Group, "completedAt" | "startedAt" | "dbStatus"> | null;
}): boolean {
  const total = input.totalDays ?? CHALLENGE_TOTAL_DAYS;
  const now = input.now ?? Date.now();
  const week = challengeDayToWeek(input.challengeDay, total);
  const currentWeek = challengeDayToWeek(input.currentDay, total);

  if (week === currentWeek) return true;

  if (
    week === CHALLENGE_WEEKS &&
    input.isGroupCompleted &&
    input.groupForGrace &&
    isWithinCompletionGracePeriod(input.groupForGrace, now)
  ) {
    return true;
  }

  const startedAt = input.groupForGrace?.startedAt ?? input.startedAt;
  return isWithinWeekDownloadWindow(startedAt, week, now, total);
}

/** MyTab 배너 — `dates.getWeeklyShortsWindow`와 동일 규칙, 창 계산은 `weekDownloadWindowMs` 공유 */
export function getWeeklyShortsDownloadWindow(
  startedAt: string | null | undefined,
  now = new Date(),
): WeeklyShortsWindow | null {
  if (!startedAt) return null;
  const dayCount = challengeDayNumber(startedAt, now);
  if (dayCount < 7) return null;

  let week: number;
  if (dayCount >= CHALLENGE_TOTAL_DAYS) {
    if (dayCount !== CHALLENGE_TOTAL_DAYS) return null;
    week = CHALLENGE_WEEKS;
  } else if (dayCount % 7 !== 0) {
    return null;
  } else {
    week = dayCount / 7;
  }

  const bounds = weekDownloadWindowMs(startedAt, week);
  if (!bounds) return null;
  const ts = now.getTime();
  if (ts < bounds.windowStartMs || ts >= bounds.expiresAtMs) return null;

  return { week, dayCount, expiresAt: bounds.expiresAtMs };
}
