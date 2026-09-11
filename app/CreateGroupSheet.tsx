// 2müns — '새 모임 개설' 바텀시트 모달
"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";
import { ChevronDown, Info, Lock, Timer, Users, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Notice } from "@/lib/database.types";
import { ME_AVATAR, type Group } from "./data";
import { getCategoryThumbnail } from "@/lib/categories";
import { BottomSheet } from "./ui";

export const GROUP_CATEGORIES = [
  "운동/헬스",
  "미라클모닝",
  "학습/성장",
  "생활/마인드셋",
  "기타 습관 (자유 습관)",
] as const;

const CATEGORY_GUIDES: { label: string; examples: string }[] = [
  { label: "운동/헬스", examples: "웨이트, 러닝, 홈트, 스트레칭 등" },
  { label: "미라클모닝", examples: "기상 인증, 침대 정리, 아침 물 한잔 등" },
  { label: "학습/성장", examples: "독서, 코딩, 자격증, 외국어 등" },
  { label: "생활/마인드셋", examples: "명상, 일기, 식단, 비타민 복용 등" },
  { label: "기타 습관", examples: "나만의 자유로운 습관 형성" },
];

// 개설 시 랜덤으로 부여할 아이콘/그라디언트 후보
const ICONS = ["🔥", "⚡", "🎯", "🌱", "🏆", "✨"];
const GRADIENTS = [
  "linear-gradient(135deg,#00FF87,#0ea5e9)",
  "linear-gradient(135deg,#a855f7,#6366f1)",
  "linear-gradient(135deg,#f472b6,#fb7185)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
];

const HOUR_MIN = 0;
const HOUR_MAX = 24;
const HOUR_GAP = 1;

function hourToTime(hour: number) {
  if (hour >= 24) return "24:00";
  return `${String(hour).padStart(2, "0")}:00`;
}

function formatHour(h: number) {
  return `${String(h).padStart(2, "0")}:00`;
}

function CategoryGuideTip() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  function showTip() {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setOpen(true);
  }

  function hideTipSoon() {
    if (hideTimer.current) {
      window.clearTimeout(hideTimer.current);
    }
    hideTimer.current = window.setTimeout(() => setOpen(false), 180);
  }

  useEffect(() => {
    if (!open || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, left: Math.max(12, rect.left - 8) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="카테고리 안내"
        aria-expanded={open}
        onMouseEnter={showTip}
        onMouseLeave={hideTipSoon}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen((prev) => !prev);
        }}
        className="flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-[#00FF87]"
      >
        <Info size={14} />
      </button>
      {open ? (
        <div
          role="tooltip"
          onMouseEnter={showTip}
          onMouseLeave={hideTipSoon}
          className="fixed z-[70] w-[min(calc(100vw-2.5rem),280px)] rounded-xl border border-gray-700 bg-[#1B1D22] p-3 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="mb-2 text-[11px] font-semibold text-gray-300">카테고리 예시</p>
          <ul className="space-y-1.5">
            {CATEGORY_GUIDES.map((item) => (
              <li key={item.label} className="text-[11px] leading-relaxed text-gray-400">
                <span className="font-semibold text-white">{item.label}</span>
                <span className="text-gray-500">: </span>
                {item.examples}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function CategorySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 6, left: rect.left, width: rect.width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent | TouchEvent) {
      const target = event.target as Node;
      if (!wrapRef.current?.contains(target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("touchstart", handlePointer);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("touchstart", handlePointer);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between rounded-xl border bg-[#121316] px-3.5 py-3 text-left text-sm outline-none transition-colors ${
          open ? "border-[#00FF87]" : "border-gray-700"
        } ${value ? "text-white" : "text-gray-600"}`}
      >
        <span>{value || "카테고리를 선택해 주세요"}</span>
        <ChevronDown
          size={18}
          className={`shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="fixed z-[70] overflow-hidden rounded-xl border border-gray-700 bg-[#1B1D22] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          style={{ top: menuPos.top, left: menuPos.left, width: menuPos.width }}
        >
          {GROUP_CATEGORIES.map((option) => {
            const selected = option === value;
            return (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className={`flex w-full px-3.5 py-2.5 text-left text-sm transition-colors ${
                    selected
                      ? "bg-[#00FF87]/12 font-semibold text-[#00FF87]"
                      : "text-gray-200 hover:bg-white/5"
                  }`}
                >
                  {option}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function clampHour(n: number) {
  return Math.min(HOUR_MAX, Math.max(HOUR_MIN, Math.round(n)));
}

/** 0~24시 듀얼 레인지 슬라이더 */
function TimeRangeSlider({
  start,
  end,
  onChange,
  disabled,
}: {
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
  disabled: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<"start" | "end" | null>(null);

  function hourFromClientX(clientX: number) {
    const track = trackRef.current;
    if (!track) return start;
    const rect = track.getBoundingClientRect();
    const pct = rect.width === 0 ? 0 : (clientX - rect.left) / rect.width;
    return clampHour(pct * HOUR_MAX);
  }

  function apply(which: "start" | "end", hour: number) {
    if (which === "start") {
      onChange(Math.min(hour, end - HOUR_GAP), end);
    } else {
      onChange(start, Math.max(hour, start + HOUR_GAP));
    }
  }

  function onPointerDown(which: "start" | "end") {
    return (e: PointerEvent<HTMLButtonElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = which;
    };
  }

  function onPointerMove(e: PointerEvent<HTMLButtonElement>) {
    if (disabled || !dragging.current) return;
    apply(dragging.current, hourFromClientX(e.clientX));
  }

  function onPointerUp(e: PointerEvent<HTMLButtonElement>) {
    if (dragging.current) {
      dragging.current = null;
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  }

  function onTrackPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    const hour = hourFromClientX(e.clientX);
    const which = Math.abs(hour - start) <= Math.abs(hour - end) ? "start" : "end";
    dragging.current = which;
    apply(which, hour);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  const startPct = (start / HOUR_MAX) * 100;
  const endPct = (end / HOUR_MAX) * 100;

  return (
    <div className={disabled ? "pointer-events-none opacity-40" : ""}>
      <div
        ref={trackRef}
        role="group"
        aria-label="인증 가능 시간 범위"
        onPointerDown={onTrackPointerDown}
        onPointerMove={(e) => {
          if (!dragging.current) return;
          apply(dragging.current, hourFromClientX(e.clientX));
        }}
        onPointerUp={() => {
          dragging.current = null;
        }}
        className="relative h-8 cursor-pointer touch-none select-none"
      >
        {/* 베이스 트랙 */}
        <div className="absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 rounded-full bg-[#2A2D34]" />
        {/* 활성 구간 */}
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[#00FF87] shadow-[0_0_10px_#00FF8799]"
          style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
        />
        <Handle
          hour={start}
          pct={startPct}
          label="시작 시간"
          disabled={disabled}
          onPointerDown={onPointerDown("start")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyNudge={(delta) => apply("start", start + delta)}
        />
        <Handle
          hour={end}
          pct={endPct}
          label="종료 시간"
          disabled={disabled}
          onPointerDown={onPointerDown("end")}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyNudge={(delta) => apply("end", end + delta)}
        />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-gray-500">
        <span>0시</span>
        <span>24시</span>
      </div>
    </div>
  );
}

function Handle({
  hour,
  pct,
  label,
  disabled,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyNudge,
}: {
  hour: number;
  pct: number;
  label: string;
  disabled: boolean;
  onPointerDown: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLButtonElement>) => void;
  onKeyNudge: (delta: number) => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-valuemin={HOUR_MIN}
      aria-valuemax={HOUR_MAX}
      aria-valuenow={hour}
      aria-valuetext={formatHour(hour)}
      role="slider"
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowUp") {
          e.preventDefault();
          onKeyNudge(1);
        } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
          e.preventDefault();
          onKeyNudge(-1);
        }
      }}
      className="absolute top-1/2 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 touch-none rounded-full border-2 border-[#121316] bg-[#00FF87] shadow-[0_0_12px_#00FF87cc] outline-none focus-visible:ring-2 focus-visible:ring-[#00FF87]"
      style={{ left: `${pct}%` }}
    />
  );
}

export function CreateGroupSheet({
  open,
  onClose,
  onCreate,
  onCreatedNotice,
  onNoticesRefresh,
  ownerId = "me",
  ownerName = "나",
  ownerAvatar = ME_AVATAR,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (g: Group) => void;
  onCreatedNotice?: (notice: Notice) => void;
  onNoticesRefresh?: () => void;
  ownerId?: string;
  ownerName?: string;
  ownerAvatar?: string;
}) {
  const [name, setName] = useState("");
  const [intro, setIntro] = useState("");
  const [category, setCategory] = useState("");
  const [verifyAnytime, setVerifyAnytime] = useState(false);
  const [verifyStart, setVerifyStart] = useState(5);
  const [verifyEnd, setVerifyEnd] = useState(9);
  const [saving, setSaving] = useState(false);

  const canSubmit =
    name.trim().length > 0 && intro.trim().length > 0 && category.length > 0 && !saving;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    const id = crypto.randomUUID();
    const title = name.trim();
    const description = intro.trim();

    let groupInserted = false;
    try {
      const { error } = await supabase.from("groups").insert({
        id,
        title,
        category,
        description,
        auth_start_time: hourToTime(verifyStart),
        auth_end_time: hourToTime(verifyEnd),
        is_flexible: verifyAnytime,
        max_capacity: 6,
        current_count: 1,
        status: "recruiting",
        owner_id: ownerId || null,
      });
      if (error) {
        console.error("groups insert failed", error);
      } else {
        groupInserted = true;
        if (ownerId) {
          let { error: memberError } = await supabase.from("group_members").insert({
            group_id: id,
            user_id: ownerId,
            nickname: ownerName || null,
            avatar_url: ownerAvatar || null,
          });
          if (memberError && (memberError.code === "PGRST204" || memberError.code === "42703")) {
            ({ error: memberError } = await supabase.from("group_members").insert({
              group_id: id,
              user_id: ownerId,
            }));
          }
          if (memberError) {
            console.error("group_members insert failed", memberError);
          }
        }
      }
    } catch (error) {
      console.error("groups insert failed", error);
    }

    const now = new Date().toISOString();
    const noticeTitle = `[${title}] 모임이 개설되었습니다!`;
    const noticeContent =
      "새로운 66일 습관 모임이 생성되었습니다. 멤버가 2명 이상 모이면 언제든 레이스를 시작할 수 있어요!";
    const localNotice: Notice = {
      id: crypto.randomUUID(),
      title: noticeTitle,
      content: noticeContent,
      tag: "개설",
      is_active: true,
      user_id: ownerId,
      created_at: now,
    };
    onCreatedNotice?.(localNotice);

    if (groupInserted) {
      try {
        const { error: noticeError } = await supabase.from("notices").insert({
          user_id: ownerId,
          title: noticeTitle,
          content: noticeContent,
          tag: "개설",
          is_active: true,
          created_at: now,
        });
        if (noticeError) {
          console.error(
            "notices insert failed",
            JSON.stringify(noticeError, null, 2),
            noticeError.message,
          );
        } else {
          onNoticesRefresh?.();
        }
      } catch (error) {
        console.error("notices insert failed", error);
      }
    }

    const newGroup: Group = {
      id,
      name: title,
      intro: description,
      category,
      icon: ICONS[Math.floor(Math.random() * ICONS.length)],
      gradient: GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)],
      cover: getCategoryThumbnail(category),
      day: 0,
      total: 66,
      capacity: 6,
      ownerId,
      members: [{ id: ownerId, name: ownerName, color: GRADIENTS[0], avatar: ownerAvatar }],
      filter: "joinable",
      raceStatus: "recruiting",
      verifyAnytime,
      verifyStartHour: verifyStart,
      verifyEndHour: verifyEnd,
    };
    onCreate(newGroup);
    setName("");
    setIntro("");
    setCategory("");
    setVerifyAnytime(false);
    setVerifyStart(5);
    setVerifyEnd(9);
    setSaving(false);
    onClose();
  }

  const inputCls =
    "w-full rounded-xl border border-gray-700 bg-[#121316] px-3.5 py-3 text-sm text-white placeholder:text-gray-600 outline-none focus:border-[#00FF87]";

  const rangeLabel = verifyAnytime
    ? "하루 중 언제든 자유롭게 인증"
    : `${formatHour(verifyStart)} ~ ${formatHour(verifyEnd)} 사이 인증`;

  return (
    <BottomSheet open={open} onClose={onClose} title="새 모임 개설">
      <div className="space-y-4">
        {/* 모임명 */}
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-gray-300">모임명</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 미라클 모닝 5AM"
            maxLength={20}
            className={inputCls}
          />
        </div>

        {/* 카테고리 */}
        <div>
          <div className="mb-1.5 flex items-center gap-1">
            <label className="text-[13px] font-semibold text-gray-300">카테고리</label>
            <CategoryGuideTip />
          </div>
          <CategorySelect value={category} onChange={setCategory} />
        </div>

        {/* 소개 및 규칙 */}
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-gray-300">
            모임 소개 및 규칙
          </label>
          <textarea
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            placeholder="어떤 습관을 함께 만들까요? 인증 규칙도 적어주세요."
            rows={3}
            maxLength={120}
            className={`${inputCls} resize-none`}
          />
        </div>

        {/* 고정 안내 (정원 / 기간) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-800 bg-[#121316] p-3">
            <Users size={18} className="text-[#00FF87]" />
            <div>
              <p className="text-[13px] font-semibold text-white">최대 6명</p>
              <p className="text-[11px] text-gray-500">정원 고정</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-800 bg-[#121316] p-3">
            <Timer size={18} className="text-[#00FF87]" />
            <div>
              <p className="text-[13px] font-semibold text-white">66일</p>
              <p className="text-[11px] text-gray-500">기간 고정</p>
            </div>
          </div>
        </div>

        {/* 인증 가능 시간 */}
        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-gray-300">인증 가능 시간</p>
          <p
            className={`mb-3 text-sm font-semibold ${
              verifyAnytime ? "text-gray-400" : "text-[#00FF87]"
            }`}
          >
            {rangeLabel}
          </p>
          <TimeRangeSlider
            start={verifyStart}
            end={verifyEnd}
            disabled={verifyAnytime}
            onChange={(s, e) => {
              setVerifyStart(s);
              setVerifyEnd(e);
            }}
          />
          <label className="mt-2.5 flex cursor-pointer items-start gap-2 text-[12px] leading-snug text-gray-400">
            <input
              type="checkbox"
              checked={verifyAnytime}
              onChange={(e) => setVerifyAnytime(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#00FF87]"
            />
            시간 설정 없음 (24시간 자유 인증)
          </label>
        </div>

        {/* 정책 안내 */}
        <div className="space-y-2.5 rounded-xl bg-white/5 p-3.5">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-zinc-400">
            <Zap size={15} className="mt-0.5 shrink-0 text-[#00FF87]" />
            <span>
              <span className="font-medium text-white">2명 이상</span>만 모이면 방장 재량으로 언제든{" "}
              <span className="font-medium text-white">66일 레이스를 바로 시작</span>할 수 있어요.
              (최대 6인)
            </span>
          </p>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-zinc-400">
            <Timer size={15} className="mt-0.5 shrink-0 text-[#00FF87]" />
            <span>
              챌린지는 <span className="font-medium text-white">66일 유지 후 자동으로 폭파</span>
              됩니다. 습관만 남기고 방은 사라져요.
            </span>
          </p>
          <p className="flex items-start gap-2 text-xs leading-relaxed text-zinc-400">
            <Lock size={15} className="mt-0.5 shrink-0 text-[#00FF87]" />
            <span>
              모임 내 모든 영상/정보는{" "}
              <span className="font-medium text-white">참여 멤버에게만</span> 공개되는 비공개
              방입니다.
            </span>
          </p>
        </div>

        {/* 만들기 버튼 */}
        <button
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          className={`w-full rounded-xl py-3.5 text-center text-sm font-bold transition-colors ${
            canSubmit
              ? "bg-[#00FF87] text-black active:scale-[0.98]"
              : "cursor-not-allowed bg-gray-700 text-gray-500"
          }`}
        >
          {saving ? "만드는 중..." : "모임 만들기"}
        </button>
      </div>
    </BottomSheet>
  );
}
