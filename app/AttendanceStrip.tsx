// 2müns — MY 탭 최근 14일 가로 출석 캘린더 스트립
"use client";

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
export const ATTENDANCE_LIVES = 3;

type DayStatus = "done" | "missed" | "pending";

export type AttendanceCell = {
  key: string;
  day: number;
  weekday: string;
  isToday: boolean;
  status: DayStatus;
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

export function buildAttendanceStrip(
  doneFlags: boolean[],
  now = new Date(),
): AttendanceCell[] {
  const today = startOfDay(now);
  return Array.from({ length: 14 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (13 - index));
    const isToday = index === 13;
    const done = Boolean(doneFlags[index]);
    const status: DayStatus = done ? "done" : isToday ? "pending" : "missed";
    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
      day: date.getDate(),
      weekday: WEEKDAY_KO[date.getDay()],
      isToday,
      status,
    };
  });
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
  return "누락";
}

export function AttendanceStrip({
  doneFlags,
  livesLeft,
}: {
  doneFlags: boolean[];
  livesLeft: number;
}) {
  const days = buildAttendanceStrip(doneFlags);
  const lives = Math.max(0, livesLeft);

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-white">출석 캘린더</h2>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
          남은 기회: <span aria-label={`남은 기회 ${lives}회`}>💚 {lives}</span>
        </span>
      </div>

      <div className="no-scrollbar -mx-1 overflow-x-auto">
        <div className="grid min-w-full grid-cols-7 gap-1.5">
          {days.map((cell) => (
            <div
              key={cell.key}
              title={`${cell.weekday}요일 ${cell.day}일 · ${statusLabel(cell)}`}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 ${
                cell.isToday ? "bg-[#00e599]/10 ring-1 ring-[#00e599]" : ""
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
