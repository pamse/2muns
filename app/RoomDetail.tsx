// 2müns — 모임 상세 룸 (Setlog 스타일 2×3 일일 인증 현황)
"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Camera, ChevronLeft, ChevronRight, Download, Loader2, Lock, Users } from "lucide-react";
import { CameraVerifyModal } from "./CameraVerifyModal";
import {
  getGroupOwnerId,
  hasRaceStarted,
  isGroupOwner,
  ME_AVATAR,
  type Group,
  type Member,
} from "./data";
import { removeGroupMember } from "@/lib/groups";
import { supabase } from "@/lib/supabase";
import type { Notice, Verification } from "@/lib/database.types";
import {
  fetchVerifications,
  uploadVerificationVideo,
  upsertVerification,
  verificationVideoUrl,
} from "@/lib/verifications";
import { Avatar, GroupThumb, Pill, StackedAvatars } from "./ui";

type Seat = {
  id: string;
  name: string;
  color: string;
  avatar?: string;
  me?: boolean;
  empty?: boolean;
  videoUrl?: string | null;
  archived?: boolean;
  canVerify?: boolean;
  comment?: string;
  verifiedAtLabel?: string;
};

function WaitingMascot() {
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 72 72" className="h-14 w-14" aria-hidden>
        <circle cx="36" cy="32" r="20" fill="#2A2D34" />
        <circle cx="29" cy="30" r="2.4" fill="#9ca3af" />
        <circle cx="43" cy="30" r="2.4" fill="#9ca3af" />
        <path
          d="M30 40c2.2 3.4 9.8 3.4 12 0"
          fill="none"
          stroke="#6b7280"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <ellipse cx="36" cy="58" rx="14" ry="5" fill="#2A2D34" />
      </svg>
      <p className="mt-1.5 text-[11px] font-semibold text-gray-500">인증 대기 중</p>
    </div>
  );
}

function VerifySpeechBubble() {
  return (
    <div className="relative mb-2">
      <span className="inline-flex items-center rounded-2xl bg-[#00FF87] px-2.5 py-1 text-[11px] font-extrabold text-black shadow-[0_6px_16px_#00FF8766]">
        인증하기
      </span>
      <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-[#00FF87]" />
    </div>
  );
}

function buildSeats(
  group: Group,
  myName: string,
  myAvatar: string,
  userId?: string | null,
): Seat[] {
  const members = group.members;

  return Array.from({ length: 6 }, (_, index) => {
    if (index >= members.length) {
      return {
        id: `empty-${index}`,
        name: "",
        color: "#18181b",
        empty: true,
        videoUrl: null,
      };
    }

    const member: Member = members[index];
    const me =
      member.id === "me" ||
      (Boolean(userId) && member.id === userId) ||
      (Boolean(group.ownerId) &&
        member.id === group.ownerId &&
        (group.ownerId === "me" || group.ownerId === userId));

    return {
      id: member.id || `member-${index}`,
      name: me ? myName || member.name : member.name,
      color: member.color,
      avatar: me ? myAvatar || member.avatar : member.avatar,
      me,
      videoUrl: null,
    };
  });
}

function VerifyCaptionBadge({
  day,
  comment,
}: {
  day: number;
  comment?: string;
}) {
  const text = comment?.trim();
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center bg-gradient-to-t from-black/80 via-black/40 to-transparent px-2 pb-2.5 pt-10">
      <span className="inline-flex max-w-[90%] flex-col items-center justify-center rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-center backdrop-blur-md">
        <span className="text-[10px] font-bold leading-tight text-[#00e599]">
          🔥 Day {day}
        </span>
        <span className="max-w-full truncate text-xs font-medium leading-tight text-white">
          {text || "인증 완료"}
        </span>
      </span>
    </div>
  );
}

function MemberVerifyCard({
  seat,
  challengeDay,
  onVerifyMe,
}: {
  seat: Seat;
  challengeDay: number;
  onVerifyMe: () => void;
}) {
  if (seat.empty) {
    return (
      <article className="pointer-events-none relative aspect-[3/4] overflow-hidden rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/40">
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
          <Lock size={16} strokeWidth={1.75} className="text-zinc-700" />
          <p className="text-xs text-zinc-600">비어 있음</p>
        </div>
      </article>
    );
  }

  const verified =
    Boolean(seat.videoUrl) || Boolean(seat.archived) || Boolean(seat.verifiedAtLabel);
  const clickable = Boolean(seat.canVerify && seat.me && !verified);

  return (
    <article
      className={`relative aspect-[3/4] overflow-hidden rounded-2xl border bg-[#1a1b1e] ${
        seat.me && !verified
          ? "border-[#00FF87]/45"
          : verified
            ? "border-white/10"
            : "border-white/8"
      }`}
    >
      {clickable ? (
        <button
          type="button"
          onClick={onVerifyMe}
          aria-label="실시간 3초 인증 촬영"
          className="absolute inset-0 z-20"
        />
      ) : null}

      {verified && seat.videoUrl ? (
        <video
          key={seat.videoUrl}
          src={seat.videoUrl}
          className="absolute inset-0 h-full w-full rounded-2xl object-cover"
          autoPlay
          loop
          muted
          playsInline
        />
      ) : verified ? (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-700 to-zinc-950">
          {seat.avatar ? (
            <img
              src={seat.avatar}
              alt=""
              className="h-full w-full object-cover opacity-45"
            />
          ) : null}
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center px-2">
          {seat.me && seat.canVerify ? (
            <div className="flex flex-col items-center">
              <VerifySpeechBubble />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#00FF87]/12">
                <span className="absolute inset-0 animate-ping rounded-full bg-[#00FF87]/20" />
                <Camera size={22} className="relative text-[#00FF87]" strokeWidth={2.3} />
              </span>
            </div>
          ) : (
            <WaitingMascot />
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/55 to-transparent px-2 pb-8 pt-2">
        <div className="flex max-w-full items-center gap-1.5">
          <Avatar
            name={seat.name}
            color={seat.color}
            src={seat.avatar}
            size={22}
          />
          <span className="truncate text-[11px] font-semibold text-white drop-shadow">
            {seat.name}
            {seat.me ? (
              <span className="ml-1 text-[10px] font-medium text-[#00FF87]">나</span>
            ) : null}
          </span>
        </div>
      </div>

      {verified ? (
        <VerifyCaptionBadge day={challengeDay} comment={seat.comment} />
      ) : null}
    </article>
  );
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function collectMemberIds(group: Group) {
  const ids = new Set<string>();
  for (const member of group.members) {
    if (member.id) {
      ids.add(member.id);
    }
  }
  if (group.ownerId) {
    ids.add(group.ownerId);
  }
  return [...ids];
}

function formatClock(hour: number) {
  if (hour >= 24) return "24:00";
  return `${String(Math.max(0, hour)).padStart(2, "0")}:00`;
}

function verifyWindowLabel(group: Group) {
  if (group.verifyAnytime) {
    return "⏰ 오늘의 인증 시간: 24시간 상시";
  }
  const start = formatClock(group.verifyStartHour ?? 5);
  const end = formatClock(group.verifyEndHour ?? 9);
  return `⏰ 오늘의 인증 시간: ${start} ~ ${end}`;
}

function padClock(n: number) {
  return String(n).padStart(2, "0");
}

function formatVerifiedAt(date = new Date()) {
  return `${padClock(date.getHours())}:${padClock(date.getMinutes())} 인증`;
}

function seatsForChallengeDay(
  base: Seat[],
  challengeDay: number,
  currentDay: number,
  rows: Verification[],
): Seat[] {
  const isToday = challengeDay === currentDay;
  const byUser = new Map(rows.map((row) => [row.user_id, row]));

  return base.map((seat) => {
    if (seat.empty) {
      return { ...seat, canVerify: false, archived: false, comment: "", verifiedAtLabel: "" };
    }
    const row = byUser.get(seat.id);
    const videoUrl = row ? verificationVideoUrl(row.video_path) : null;
    const verified = Boolean(row);
    return {
      ...seat,
      videoUrl,
      canVerify: Boolean(seat.me && isToday && !verified),
      archived: false,
      comment: row?.comment ?? "",
      verifiedAtLabel: row ? formatVerifiedAt(new Date(row.created_at)) : "",
    };
  });
}

function VerifyTimeBanner({ group }: { group: Group }) {
  return (
    <div className="shrink-0 px-3 pt-3">
      <p className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-center text-[12px] font-medium leading-relaxed text-slate-200">
        {verifyWindowLabel(group)}
      </p>
    </div>
  );
}

function WeekDayNav({
  weekIndex,
  dayOffset,
  currentDay,
  totalDays,
  onWeekChange,
  onSelectOffset,
}: {
  weekIndex: number;
  dayOffset: number;
  currentDay: number;
  totalDays: number;
  onWeekChange: (next: number) => void;
  onSelectOffset: (offset: number) => void;
}) {
  const maxWeek = Math.max(0, Math.floor((Math.max(1, currentDay) - 1) / 7));
  const weekNumber = weekIndex + 1;

  return (
    <div className="shrink-0 px-3 pt-2.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="이전 주차"
          disabled={weekIndex <= 0}
          onClick={() => onWeekChange(weekIndex - 1)}
          className="rounded-lg p-1 text-slate-300 disabled:text-slate-700"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="min-w-0 flex-1 text-center text-[13px] font-semibold text-white">
          {weekNumber}주차{" "}
          <span className="font-medium text-slate-400">(Week {weekNumber})</span>
        </p>
        <button
          type="button"
          aria-label="주간 아카이브 다운로드"
          title="7일 숏폼 묶음 다운로드 (준비 중)"
          className="rounded-lg p-1 text-slate-500 transition-colors hover:text-[#00e599]"
        >
          <Download size={16} />
        </button>
        <button
          type="button"
          aria-label="다음 주차"
          disabled={weekIndex >= maxWeek}
          onClick={() => onWeekChange(weekIndex + 1)}
          className="rounded-lg p-1 text-slate-300 disabled:text-slate-700"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-center gap-1 px-4">
        {Array.from({ length: 7 }, (_, offset) => {
          const dayNum = weekIndex * 7 + offset + 1;
          const selected = offset === dayOffset;
          const isFuture = dayNum > currentDay || dayNum > totalDays;
          const isPast = dayNum < currentDay && dayNum <= totalDays;
          return (
            <button
              key={offset}
              type="button"
              disabled={isFuture}
              aria-current={selected ? "true" : undefined}
              aria-label={`${dayNum}일차`}
              onClick={() => onSelectOffset(offset)}
              className={`flex h-6 flex-1 items-center justify-center ${
                isFuture ? "cursor-not-allowed" : ""
              }`}
            >
              <span
                className={`h-1.5 rounded-full transition-all ${
                  selected
                    ? "w-6 bg-[#00e599]"
                    : isPast
                      ? "w-2.5 bg-[#00e599]/50"
                      : "w-2.5 bg-slate-700"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function isCurrentMember(member: Member, userId?: string | null) {
  return member.id === "me" || (Boolean(userId) && member.id === userId);
}

function WaitingInfoCard({ group }: { group: Group }) {
  const anytime = Boolean(group.verifyAnytime);
  const start = formatClock(group.verifyStartHour ?? 5);
  const end = formatClock(group.verifyEndHour ?? 9);

  return (
    <section className="my-4 w-full rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 text-left">
      <Pill tone="accent">{group.category || "기타 습관"}</Pill>
      <p className="mt-3 text-[11px] font-semibold text-zinc-500">모임 소개 및 규칙</p>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-300">
        {group.intro || "등록된 소개가 없습니다."}
      </p>
      <p
        className={`mt-3 text-[13px] font-semibold ${
          anytime ? "text-zinc-300" : "text-[#00FF87]"
        }`}
      >
        {anytime
          ? "⏱️ 인증 시간: 24시간 상시 인증"
          : `⏱️ 인증 시간: ${start} ~ ${end} 사이 인증`}
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-zinc-400">
        🔥 2명 이상 모이면 방장이 출발 가능 · 66일 완주 챌린지
      </p>
    </section>
  );
}

function LobbyConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[70] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lobby-confirm-title"
        className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#1B1D22] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
      >
        <h2 id="lobby-confirm-title" className="text-center text-lg font-bold text-white">
          {title}
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-gray-400">{message}</p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-white/8 py-3 text-sm font-semibold text-gray-300"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-rose-500 py-3 text-sm font-bold text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    host,
  );
}

function WaitingLobby({
  group,
  isOwner,
  starting,
  onStart,
  onLeave,
  onDelete,
}: {
  group: Group;
  isOwner: boolean;
  starting: boolean;
  onStart: () => void;
  onLeave: () => void;
  onDelete: () => void;
}) {
  const memberCount = group.members.length;
  const canStart = memberCount >= 2;
  const capacity = group.capacity;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
        <div className="flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00e599]/12">
            <Users size={22} className="text-[#00e599]" />
          </div>
          <h2 className="text-center text-lg font-bold text-white">멤버 대기 라운지</h2>
          <p className="mt-1.5 text-center text-[13px] leading-relaxed text-zinc-400">
            {isOwner
              ? canStart
                ? "모인 인원으로 언제든 레이스를 시작할 수 있어요."
                : "함께할 멤버를 1명 이상 기다리고 있어요"
              : "방장이 66일 레이스를 시작하기를 기다리고 있어요."}
          </p>
          <WaitingInfoCard group={group} />
          <div className="pb-1">
            <StackedAvatars
              members={group.members}
              capacity={capacity}
              size={32}
              ownerId={getGroupOwnerId(group)}
            />
          </div>
        </div>
      </div>

      {isOwner ? (
        <div className="shrink-0 px-4 pb-4 pt-2">
          <p className="mb-2.5 text-center text-xs text-zinc-400">
            {canStart
              ? `멤버 준비 완료! (${memberCount}/${capacity}명)`
              : `최소 2명부터 출발할 수 있어요 (현재 ${memberCount}/${capacity}명)`}
          </p>
          <button
            type="button"
            disabled={!canStart || starting}
            onClick={onStart}
            className={`w-full rounded-2xl bg-[#00e599] py-3.5 font-bold text-black transition-all ${
              canStart && !starting
                ? "shadow-[0_0_20px_rgba(0,229,153,0.35)] hover:scale-[1.02] active:scale-[0.98]"
                : "cursor-not-allowed opacity-50"
            }`}
          >
            {starting ? "시작하는 중..." : "[ 🔥 66일 레이스 스타트! ]"}
          </button>
          <div className="mt-1 flex justify-center">
            <button
              type="button"
              onClick={onDelete}
              className="cursor-pointer py-2 text-xs text-zinc-500 underline transition-colors hover:text-rose-400"
            >
              모임 삭제
            </button>
          </div>
        </div>
      ) : (
        <div className="shrink-0 px-4 pb-4 pt-1 text-center">
          <p className="text-xs text-zinc-500">시작되면 알림으로 알려드릴게요</p>
          <button
            type="button"
            onClick={onLeave}
            className="cursor-pointer py-2 text-xs text-zinc-500 underline transition-colors hover:text-rose-400"
          >
            참여 취소
          </button>
        </div>
      )}
    </div>
  );
}

export function RoomDetail({
  group,
  onBack,
  nickname,
  myAvatar,
  userId,
  onGroupUpdate,
  onRaceNotices,
  onNoticesRefresh,
  onLeaveGroup,
  onDeleteGroup,
  requireAuth,
  autoOpenVerify = false,
  onAutoOpenVerifyHandled,
}: {
  group: Group;
  onBack: () => void;
  nickname?: string;
  myAvatar?: string | null;
  userId?: string | null;
  onGroupUpdate?: (group: Group) => void;
  onRaceNotices?: (notice: Notice) => void;
  onNoticesRefresh?: () => void;
  onLeaveGroup?: (group: Group) => void;
  onDeleteGroup?: (groupId: string) => void;
  requireAuth?: () => boolean;
  autoOpenVerify?: boolean;
  onAutoOpenVerifyHandled?: () => void;
}) {
  const [cameraOpen, setCameraOpen] = useState(false);
  const [dayRows, setDayRows] = useState<Verification[]>([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"leave" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const currentDay = Math.max(1, group.day);
  const [weekIndex, setWeekIndex] = useState(() => Math.floor((currentDay - 1) / 7));
  const [dayOffset, setDayOffset] = useState(() => (currentDay - 1) % 7);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const day = Math.max(1, group.day);
    setWeekIndex(Math.floor((day - 1) / 7));
    setDayOffset((day - 1) % 7);
  }, [group.id, group.day]);

  useEffect(() => {
    if (!autoOpenVerify) return;
    setCameraOpen(true);
    onAutoOpenVerifyHandled?.();
  }, [autoOpenVerify, onAutoOpenVerifyHandled]);

  const started = hasRaceStarted(group);
  const owner = isGroupOwner(group, userId);
  const challengeDay = weekIndex * 7 + dayOffset + 1;
  const viewingToday = challengeDay === currentDay;
  const maxWeek = Math.max(0, Math.floor((currentDay - 1) / 7));

  useEffect(() => {
    if (!started) return;
    let cancelled = false;
    setFeedLoading(true);
    setFeedError(null);
    void fetchVerifications(group.id, challengeDay)
      .then((rows) => {
        if (!cancelled) setDayRows(rows);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setDayRows([]);
          setFeedError(
            error instanceof Error ? error.message : "인증 피드를 불러오지 못했습니다.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setFeedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [group.id, challengeDay, started]);

  const seats = useMemo(
    () =>
      seatsForChallengeDay(
        buildSeats(group, nickname || "나", myAvatar || ME_AVATAR, userId),
        challengeDay,
        currentDay,
        dayRows,
      ),
    [group, nickname, myAvatar, userId, challengeDay, currentDay, dayRows],
  );
  const doneCount = seats.filter((seat) => seat.videoUrl || seat.verifiedAtLabel).length;

  function selectDay(nextWeek: number, nextOffset: number) {
    const dayNum = nextWeek * 7 + nextOffset + 1;
    if (dayNum < 1 || dayNum > group.total || dayNum > currentDay) return;
    setWeekIndex(nextWeek);
    setDayOffset(nextOffset);
  }

  function shiftDay(delta: number) {
    let nextWeek = weekIndex;
    let nextOffset = dayOffset + delta;
    if (nextOffset < 0) {
      if (weekIndex <= 0) return;
      nextWeek = weekIndex - 1;
      nextOffset = 6;
    } else if (nextOffset > 6) {
      if (weekIndex >= maxWeek) return;
      nextWeek = weekIndex + 1;
      nextOffset = 0;
    }
    selectDay(nextWeek, nextOffset);
  }

  function handleWeekChange(next: number) {
    const clamped = Math.max(0, Math.min(maxWeek, next));
    if (clamped === maxWeek) {
      selectDay(clamped, (currentDay - 1) % 7);
      return;
    }
    selectDay(clamped, 6);
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    swipeStart.current = { x: event.clientX, y: event.clientY };
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (!swipeStart.current) return;
    const dx = event.clientX - swipeStart.current.x;
    const dy = event.clientY - swipeStart.current.y;
    swipeStart.current = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) <= Math.abs(dy)) return;
    shiftDay(dx < 0 ? 1 : -1);
  }

  async function handleConfirmCapture(payload: { blob: Blob; videoUrl: string; comment: string }) {
    if (!userId) {
      throw new Error("로그인이 필요합니다.");
    }
    const comment = payload.comment.trim().slice(0, 20);
    setUploading(true);
    try {
      const uploaded = await uploadVerificationVideo({
        groupId: group.id,
        userId,
        day: currentDay,
        blob: payload.blob,
      });
      const saved = await upsertVerification({
        groupId: group.id,
        userId,
        day: currentDay,
        comment,
        videoPath: uploaded.path,
      });
      setDayRows((prev) => {
        const next = prev.filter(
          (row) => !(row.user_id === userId && row.day === currentDay),
        );
        return [...next, saved];
      });
    } catch (error) {
      throw error instanceof Error
        ? error
        : new Error("인증 저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setUploading(false);
    }
  }

  async function handleStartRace() {
    if (starting || started || group.members.length < 2) return;
    setStarting(true);

    const now = new Date().toISOString();
    const title = `[${group.name}] 66일 레이스가 시작되었습니다!`;
    const content =
      "방장이 레이스를 시작했습니다. 오늘부터 매일 3초 실시간 인증을 완료해 주세요!";
    const memberIds = collectMemberIds(group);

    const localNotice: Notice = {
      id: crypto.randomUUID(),
      title,
      content,
      tag: "시작",
      is_active: true,
      user_id: userId ?? memberIds[0] ?? null,
      created_at: now,
    };
    onRaceNotices?.(localNotice);

    const updated: Group = {
      ...group,
      raceStatus: "started",
      filter: "ongoing",
      day: 1,
    };
    onGroupUpdate?.(updated);

    const rows = memberIds.map((id) => ({
      user_id: id,
      title,
      content,
      tag: "시작",
      is_active: true,
      created_at: now,
    }));
    const uuidRows = rows.filter((row) => UUID_RE.test(row.user_id));

    try {
      await supabase
        .from("groups")
        .update({ status: "started", started_at: now })
        .eq("id", group.id);
    } catch (error) {
      console.error("groups status update failed", error);
    }

    try {
      let inserted = false;
      if (rows.length > 0) {
        const first = await supabase.from("notices").insert(rows);
        if (first.error) {
          console.error(
            "notices insert failed",
            JSON.stringify(first.error, null, 2),
            first.error.message,
          );
          if (uuidRows.length > 0 && uuidRows.length !== rows.length) {
            const retry = await supabase.from("notices").insert(uuidRows);
            if (retry.error) {
              console.error(
                "notices insert failed",
                JSON.stringify(retry.error, null, 2),
                retry.error.message,
              );
            } else {
              inserted = true;
            }
          }
        } else {
          inserted = true;
        }
      }
      if (inserted) {
        onNoticesRefresh?.();
      }
    } catch (error) {
      console.error("notices insert failed", error);
    } finally {
      setStarting(false);
    }
  }

  async function handleLeave() {
    if (busy || owner) return;
    setBusy(true);
    const remaining = group.members.filter((member) => !isCurrentMember(member, userId));
    const updated: Group = { ...group, members: remaining };
    setConfirmAction(null);
    onLeaveGroup?.(updated);
    try {
      if (userId) {
        await removeGroupMember(group.id, userId, remaining.length);
      } else {
        await supabase
          .from("groups")
          .update({ current_count: remaining.length })
          .eq("id", group.id);
      }
    } catch (error) {
      console.error("groups leave update failed", error);
    }
  }

  async function handleDelete() {
    if (busy || !owner) return;
    setBusy(true);
    setConfirmAction(null);
    onDeleteGroup?.(group.id);
    try {
      await supabase.from("groups").delete().eq("id", group.id);
    } catch (error) {
      console.error("groups delete failed", error);
    }
  }

  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#121316]">
      <header className="flex shrink-0 items-center gap-3 border-b border-gray-800 bg-[#1B1D22] px-3 py-3">
        <button type="button" onClick={onBack} aria-label="뒤로" className="p-1">
          <ArrowLeft size={22} className="text-white" />
        </button>
        <GroupThumb src={group.cover} alt={group.name} size={36} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-white">{group.name}</h1>
          <p className="flex items-center gap-1 text-[11px] text-gray-500">
            <Lock size={10} />{" "}
            {started
              ? viewingToday
                ? `오늘 인증 ${doneCount}/6 · D-${group.total - group.day}`
                : `${challengeDay}일차 인증 ${doneCount}/6`
              : `대기 중 · ${group.members.length}/${group.capacity}명`}
          </p>
        </div>
      </header>

      {started ? (
        <>
          <VerifyTimeBanner group={group} />
          <WeekDayNav
            weekIndex={weekIndex}
            dayOffset={dayOffset}
            currentDay={currentDay}
            totalDays={group.total}
            onWeekChange={handleWeekChange}
            onSelectOffset={(offset) => selectDay(weekIndex, offset)}
          />

          <div
            className="min-h-0 flex-1 touch-pan-y overflow-y-auto px-3 pb-3 pt-3"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            <p className="mb-2 text-center text-[11px] text-slate-500">
              {viewingToday ? "오늘" : `${challengeDay}일차`} · 좌우로 밀어 다른 날을 볼 수 있어요
            </p>
            {feedError ? (
              <p className="mb-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-center text-[12px] text-red-200">
                {feedError}
              </p>
            ) : null}
            {feedLoading ? (
              <p className="mb-2 flex items-center justify-center gap-2 text-[12px] text-slate-500">
                <Loader2 size={14} className="animate-spin" />
                인증 피드를 불러오는 중
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              {seats.map((seat) => (
                <MemberVerifyCard
                  key={`${challengeDay}-${seat.id}`}
                  seat={seat}
                  challengeDay={challengeDay}
                  onVerifyMe={() => {
                    if (!viewingToday) return;
                    if (requireAuth && !requireAuth()) return;
                    setCameraOpen(true);
                  }}
                />
              ))}
            </div>
          </div>
        </>
      ) : (
        <WaitingLobby
          group={group}
          isOwner={owner}
          starting={starting}
          onStart={() => void handleStartRace()}
          onLeave={() => setConfirmAction("leave")}
          onDelete={() => setConfirmAction("delete")}
        />
      )}

      <LobbyConfirmModal
        open={confirmAction !== null}
        title={confirmAction === "delete" ? "모임 삭제" : "참여 취소"}
        message={
          confirmAction === "delete"
            ? "정말 모임을 삭제하시겠습니까?"
            : "정말 모임 참여를 취소하시겠습니까?"
        }
        confirmLabel={confirmAction === "delete" ? "삭제" : "참여 취소"}
        onClose={() => {
          if (!busy) setConfirmAction(null);
        }}
        onConfirm={() => {
          if (confirmAction === "delete") {
            void handleDelete();
          } else {
            void handleLeave();
          }
        }}
      />

      <CameraVerifyModal
        open={cameraOpen}
        onClose={() => {
          if (!uploading) setCameraOpen(false);
        }}
        onConfirm={handleConfirmCapture}
      />
    </div>
  );
}
