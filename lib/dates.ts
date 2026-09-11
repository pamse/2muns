/** 앱 전역 캘린더 기준 — 한국 시간. UTC `toISOString().split('T')[0]` 사용 금지. */
export const APP_TIME_ZONE = "Asia/Seoul";

const MS_PER_DAY = 86_400_000;

export function localDateKey(value: Date | string = new Date()): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("sv-SE", { timeZone: APP_TIME_ZONE });
}

export function addDaysToKey(key: string, days: number): string {
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return key;
  const next = new Date(Date.UTC(year, month - 1, day + days));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function diffCalendarDays(fromKey: string, toKey: string): number {
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return 0;
  return Math.round(
    (Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / MS_PER_DAY,
  );
}

export function kstMidnightMs(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00+09:00`).getTime();
}

export function weekdayIndexFromKey(key: string): number {
  return new Date(`${key}T12:00:00+09:00`).getUTCDay();
}

export function dayOfMonthFromKey(key: string): number {
  return Number.parseInt(key.slice(8), 10);
}

/** DB started_at이 없으면 현재 일차로부터 Day 1 날짜를 역산한다. */
export function resolveStartedAt(
  startedAt: string | null | undefined,
  fallbackDay = 1,
  now = new Date(),
): string {
  if (startedAt) return startedAt;
  const todayKey = localDateKey(now);
  const day = Math.max(1, fallbackDay);
  return `${addDaysToKey(todayKey, -(day - 1))}T00:00:00+09:00`;
}

/** started_at 기준 공식 일차. 시작일 당일 = Day 1. */
export function challengeDayNumber(
  startedAt: string,
  now = new Date(),
  maxDays = Number.POSITIVE_INFINITY,
): number {
  const startKey = localDateKey(startedAt);
  const todayKey = localDateKey(now);
  if (!startKey || !todayKey) return 1;
  const days = diffCalendarDays(startKey, todayKey) + 1;
  return Math.max(1, Math.min(maxDays, days));
}

export type WeeklyShortsWindow = {
  week: number;
  dayCount: number;
  expiresAt: number;
};

/**
 * 7, 14, 21…일차(주차 종료일)에만 열고, 해당 KST 자정부터 24시간만 유효.
 * Day 1에는 절대 열리지 않는다.
 */
export function getWeeklyShortsWindow(
  startedAt: string | null | undefined,
  now = new Date(),
): WeeklyShortsWindow | null {
  if (!startedAt) return null;
  const dayCount = challengeDayNumber(startedAt, now);
  if (dayCount < 7 || dayCount % 7 !== 0) return null;

  const startKey = localDateKey(startedAt);
  if (!startKey) return null;
  const weekEndKey = addDaysToKey(startKey, dayCount - 1);
  const windowStart = kstMidnightMs(weekEndKey);
  const expiresAt = windowStart + MS_PER_DAY;
  const ts = now.getTime();
  if (ts < windowStart || ts >= expiresAt) return null;

  return { week: dayCount / 7, dayCount, expiresAt };
}

/** 시작일~어제까지 미인증 일수. 오늘(진행 중)과 시작 전 날짜는 결석이 아니다. */
export function countMissedChallengeDays(
  dayCount: number,
  verifiedDays: ReadonlySet<number>,
): number {
  let missed = 0;
  for (let day = 1; day < dayCount; day += 1) {
    if (!verifiedDays.has(day)) missed += 1;
  }
  return missed;
}
