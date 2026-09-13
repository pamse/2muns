// 2müns — MY 탭 누적 실천율: 먼시 캐릭터 + 66일 게이지 카드
"use client";

import { useEffect, useState } from "react";
import { Flame } from "lucide-react";

const SPEECH_SLOT_MS = 30 * 60 * 1000;

type MunsyStage = 1 | 2 | 3;

const STAGE_IMAGE: Record<MunsyStage, string> = {
  1: "/images/munsy/munsy-yellow.png",
  2: "/images/munsy/munsy-red.png",
  3: "/images/munsy/munsy-mint.png",
};

const FILL_CLASS: Record<MunsyStage, string> = {
  1: "bg-amber-400",
  2: "bg-gradient-to-r from-orange-500 to-red-500",
  3: "bg-[#00e599]",
};

const GLOW_CLASS: Record<MunsyStage, string> = {
  1: "bg-amber-400/35",
  2: "bg-orange-500/35",
  3: "bg-[#00e599]/35",
};

const BUBBLE_CLASS: Record<MunsyStage, string> = {
  1: "border-amber-400/30 bg-amber-400/12 text-amber-100",
  2: "border-orange-400/30 bg-orange-500/12 text-orange-100",
  3: "border-[#00e599]/30 bg-[#00e599]/12 text-[#b8ffe8]",
};

const MARKER_CLASS: Record<MunsyStage, string> = {
  1: "border-amber-300 bg-amber-400",
  2: "border-orange-300 bg-orange-500",
  3: "border-[#7dffd0] bg-[#00e599]",
};

const STAGE_MESSAGES: Record<MunsyStage, string[]> = {
  1: [
    "아직은 작은 불씨! 흔들리지 마",
    "오늘의 한 걸음이 내일의 습관을 만들어요",
    "시작이 반이에요, 함께 천천히 가요",
    "작은 불씨도 꾸준하면 큰 불꽃이 돼요",
    "완벽하지 않아도 괜찮아요, 계속해요",
  ],
  2: [
    "불꽃이 활활! 습관이 자리잡았어요 🔥",
    "이제 리듬이 생겼어요, 멋져요!",
    "꾸준함이 실력이 되는 중이에요",
    "습관의 불꽃, 점점 더 뜨거워지고 있어요",
    "중반 구간! 지금 페이스 아주 좋아요",
  ],
  3: [
    "66일 완주 성공! 전설의 푸른 불꽃 달성 🏆",
    "끝까지 해냈어요! 진짜 대단해요",
    "66일의 여정, 완주를 축하해요!",
    "푸른 불꽃 먼시! 당신은 해냈어요",
    "완주의 순간, 오래 기억될 거예요",
  ],
};

function getMunsyStage(currentDays: number): MunsyStage {
  if (currentDays >= 66) return 3;
  if (currentDays >= 22) return 2;
  return 1;
}

function getSpeechSlot(now = Date.now()) {
  return Math.floor(now / SPEECH_SLOT_MS);
}

function stageSpeech(stage: MunsyStage, slot: number) {
  const messages = STAGE_MESSAGES[stage];
  return messages[slot % messages.length];
}

function useSpeechSlot() {
  const [slot, setSlot] = useState(() => getSpeechSlot());

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const sync = () => setSlot(getSpeechSlot());

    const msUntilNext = SPEECH_SLOT_MS - (Date.now() % SPEECH_SLOT_MS);
    timeoutId = window.setTimeout(() => {
      sync();
      intervalId = window.setInterval(sync, SPEECH_SLOT_MS);
    }, msUntilNext);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  return slot;
}

export function MunsyProgressCard({
  currentDays,
  totalDays = 66,
  streak,
}: {
  currentDays: number;
  totalDays?: number;
  streak?: number;
}) {
  const days = Math.max(0, Math.min(currentDays, totalDays));
  const stage = getMunsyStage(days);
  const speechSlot = useSpeechSlot();
  const pct = Math.round((days / totalDays) * 100);
  const day21Pct = (21 / totalDays) * 100;

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-400">66일 누적 실천율</p>
          <p className="mt-0.5 text-[13px] font-semibold tabular-nums text-white">
            {days}일 / {totalDays}일 ({pct}%)
          </p>
        </div>
        {typeof streak === "number" ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-[#00FF87]">
            <Flame size={13} />
            {streak}일 연속
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-center">
        <div
          className={`relative mb-3 max-w-[260px] rounded-2xl border px-3 py-1.5 text-center text-[12px] font-semibold leading-relaxed ${BUBBLE_CLASS[stage]}`}
        >
          {stageSpeech(stage, speechSlot)}
          <span
            className={`absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 border-b border-r ${
              stage === 1
                ? "border-amber-400/30 bg-amber-400/12"
                : stage === 2
                  ? "border-orange-400/30 bg-orange-500/12"
                  : "border-[#00e599]/30 bg-[#00e599]/12"
            }`}
          />
        </div>

        <div className="relative mt-2 mb-5 flex h-32 w-32 items-center justify-center">
          <span
            className={`absolute inset-3 rounded-full blur-2xl ${GLOW_CLASS[stage]}`}
            aria-hidden
          />
          <img
            src={STAGE_IMAGE[stage]}
            alt={`먼시 ${stage}단계`}
            width={128}
            height={128}
            className={`munsy-float relative z-10 h-32 w-32 object-contain mix-blend-lighten ${
              stage === 3 ? "" : "munsy-crop"
            }`}
          />
        </div>
      </div>

      <div className="relative pt-1 pb-5">
        <div
          className="h-3.5 w-full overflow-hidden rounded-full bg-slate-800"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="66일 누적 실천율"
        >
          <div
            className={`h-full rounded-full transition-[width] duration-700 ${FILL_CLASS[stage]}`}
            style={{ width: `${pct}%` }}
          />
        </div>

        <Milestone
          leftPct={day21Pct}
          label="21일"
          reached={days >= 21}
          activeClass={MARKER_CLASS[stage]}
        />
        <Milestone
          leftPct={100}
          label="66일"
          reached={days >= 66}
          activeClass={MARKER_CLASS[stage]}
          align="end"
        />
      </div>
    </section>
  );
}

function Milestone({
  leftPct,
  label,
  reached,
  activeClass,
  align = "center",
}: {
  leftPct: number;
  label: string;
  reached: boolean;
  activeClass: string;
  align?: "center" | "end";
}) {
  const translate = align === "end" ? "-translate-x-full" : "-translate-x-1/2";
  return (
    <span
      className={`absolute top-1 ${translate}`}
      style={{ left: `${leftPct}%` }}
    >
      <span
        className={`block h-3.5 w-3.5 rounded-full border-2 shadow-[0_0_0_2px_#0f172a] ${
          reached ? activeClass : "border-slate-500 bg-slate-700"
        }`}
        aria-hidden
      />
      <span
        className={`mt-1 block whitespace-nowrap text-center text-[10px] font-semibold ${
          reached ? "text-slate-200" : "text-slate-500"
        } ${align === "end" ? "text-right" : ""}`}
      >
        {label}
      </span>
    </span>
  );
}
