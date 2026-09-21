// 2müns — MY 탭 출석 캘린더: 공식 시작일(Day 1)부터 정렬
"use client";

import { Plus } from "lucide-react";
import {
  addDaysToKey,
  challengeDayNumber,
  dayOfMonthFromKey,
  localDateKey,
  weekdayIndexFromKey,
} from "@/lib/dates";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
export const ATTENDANCE_LIVES = 3;
const STRIP_DAYS = 14;

type DayStatus = "done" | "missed" | "pending" | "upcoming";

export type AttendanceCell = {
  key: string;
  day: number;
  weekday: string;
  isToday: boolean;
  status: DayStatus;
  challengeDay: number;
};

export function buildAttendanceStrip({
  startedAt,
  totalDays,
  verifiedDays,
  now = new Date(),
}: {
  startedAt: string;
  totalDays: number;
  verifiedDays: ReadonlySet<number>;
  now?: Date;
}): AttendanceCell[] {
  const startKey = localDateKey(startedAt);
  const todayKey = localDateKey(now);
  if (!startKey || !todayKey) return [];

  const dayCount = challengeDayNumber(startedAt, now, totalDays);
  const cellCount = Math.min(STRIP_DAYS, Math.max(1, totalDays));

  const cells: AttendanceCell[] = [];
  for (let index = 0; index < cellCount; index += 1) {
    const challengeDay = index + 1;
    const dateKey = addDaysToKey(startKey, index);
    if (dateKey < startKey) continue;

    const isToday = dateKey === todayKey;
    const isFuture = dateKey > todayKey;
    const done = verifiedDays.has(challengeDay);

    let status: DayStatus;
    if (done) {
      status = "done";
    } else if (isFuture || challengeDay > dayCount) {
      status = "upcoming";
    } else if (isToday) {
      status = "pending";
    } else {
      status = "missed";
    }

    cells.push({
      key: dateKey,
      day: dayOfMonthFromKey(dateKey),
      weekday: WEEKDAY_KO[weekdayIndexFromKey(dateKey)] ?? "",
      isToday,
      status,
      challengeDay,
    });
  }

  return cells;
}

function StatusDot({ status }: { status: DayStatus }) {
  if (status === "done") {
    return (
      <span
        className="h-2 w-2 rounded-full bg-[#00e599] shadow-[0_0_8px_#00e599]"
        aria-hidden
      />
    );
  }
  if (status === "missed") {
    return (
      <span className="h-1.5 w-1.5 rounded-full bg-rose-500/80" aria-hidden />
    );
  }
  return <span className="h-1.5 w-1.5 rounded-full bg-slate-700" aria-hidden />;
}

function statusLabel(cell: AttendanceCell) {
  if (cell.isToday && cell.status === "pending") return "오늘 예정";
  if (cell.isToday && cell.status === "done") return "오늘 인증 완료";
  if (cell.status === "done") return "인증 완료";
  if (cell.status === "upcoming") return "예정";
  return "누락";
}

export function AttendanceStrip({
  startedAt,
  totalDays,
  verifiedDays,
  livesLeft,
  onLivesClick,
}: {
  startedAt: string;
  totalDays: number;
  verifiedDays: ReadonlySet<number>;
  livesLeft: number;
  onLivesClick?: () => void;
}) {
  const days = buildAttendanceStrip({ startedAt, totalDays, verifiedDays });
  const lives = Math.max(0, livesLeft);
  const livesLabel = (
    <>
      남은 기회:{" "}
      <span aria-label={`남은 기회 ${lives}회`}>💚 {lives}</span>
    </>
  );

  const chipClass =
    "inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 py-1 pl-2.5 pr-1 text-[11px] font-semibold text-slate-300";

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white">출석 캘린더</h2>
        {onLivesClick ? (
          <button
            type="button"
            onClick={onLivesClick}
            className={`${chipClass} transition-colors hover:border-[#00FF87]/40`}
          >
            {livesLabel}
            <span
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#00FF87]/15 text-[#00FF87]"
              aria-hidden
            >
              <Plus size={12} strokeWidth={2.8} />
            </span>
          </button>
        ) : (
          <span className={`${chipClass} pr-2.5`}>{livesLabel}</span>
        )}
      </div>

      <div className="no-scrollbar overflow-x-auto p-0.5">
        <div className="grid min-w-full grid-cols-7 gap-1.5">
          {days.map((cell) => (
            <div
              key={cell.key}
              title={`${cell.weekday}요일 ${cell.day}일 · ${statusLabel(cell)}`}
              className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-1.5 ${
                cell.isToday
                  ? "border-[#00e599] bg-[#00e599]/10"
                  : "border-transparent"
              }`}
            >
              <span className="text-[11px] text-slate-500">{cell.weekday}</span>
              <span
                className={`text-sm font-medium ${
                  cell.isToday ? "text-white" : "text-slate-200"
                }`}
              >
                {cell.day}
              </span>
              <StatusDot status={cell.status} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
