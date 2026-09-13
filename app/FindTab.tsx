// 2müns — '모임찾기' 탭 (메인 홈): 필터 + 모임 카드 리스트
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Flame, Loader2, Lock, Plus, Users } from "lucide-react";
import {
  isGroupMember,
  listJoinedActiveGroups,
  listJoinedOngoingGroups,
  type Group,
  type GroupFilter,
} from "./data";
import { groupThumbnailSrc } from "@/lib/categories";
import { Card, GroupThumb, Pill, ProgressBar, StackedAvatars } from "./ui";

export function EntryDeniedModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[55] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="entry-denied-title"
        className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#1B1D22] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
        style={{ animation: "entryDeniedIn 0.22s ease-out" }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/12">
          <Lock size={22} className="text-amber-300" />
        </div>
        <h2
          id="entry-denied-title"
          className="mt-4 text-center text-lg font-bold text-white"
        >
          입장 불가
        </h2>
        <p className="mt-2 whitespace-pre-line text-center text-[13px] leading-relaxed text-gray-400">
          {"이미 진행 중인 모임입니다.\n66일 챌린지의 몰입과 비공개 유지를 위해 기존 참여 멤버만 입장할 수 있습니다."}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
        >
          확인
        </button>
        <style>{`@keyframes entryDeniedIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      </div>
    </div>,
    host,
  );
}

export function JoinLimitModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[80] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-limit-title"
        className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#1B1D22] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
        style={{ animation: "entryDeniedIn 0.22s ease-out" }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-400/12">
          <Users size={22} className="text-amber-300" />
        </div>
        <h2
          id="join-limit-title"
          className="mt-4 text-center text-lg font-bold text-white"
        >
          참여 제한
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-gray-400">
          모임참여는 3개까지 가능합니다
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
        >
          확인
        </button>
      </div>
    </div>,
    host,
  );
}

const PULL_THRESHOLD = 64;
const PULL_MAX = 96;
const PULL_REST = 56;

function findScrollParent(el: HTMLElement) {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
}

function dampenPull(distance: number) {
  const x = Math.max(0, distance);
  return Math.min(PULL_MAX, (1 - Math.exp(-x / 78)) * PULL_MAX);
}

function PullSpinner({ spinning, progress }: { spinning: boolean; progress: number }) {
  const rotation = spinning ? undefined : Math.min(1, progress) * 270;
  return (
    <span
      className={`block h-[22px] w-[22px] rounded-full border-[2.5px] border-[#00E575]/20 border-t-[#00E575] ${
        spinning ? "animate-spin" : ""
      }`}
      style={
        spinning
          ? undefined
          : { transform: `rotate(${rotation}deg)` }
      }
      aria-hidden
    />
  );
}

function GroupCard({
  group,
  isMember,
  onOpen,
}: {
  group: Group;
  isMember: boolean;
  onOpen: (g: Group) => void;
}) {
  const isJoinable = group.filter === "joinable";
  const full = group.members.length >= group.capacity;
  const locked = !isJoinable && !isMember;
  const actionLabel = isMember
    ? "입장하기"
    : isJoinable
      ? full
        ? "모집 마감"
        : "참여하기"
      : null;
  const actionMuted = Boolean(actionLabel === "모집 마감");
  return (
    <Card onClick={() => onOpen(group)} className="overflow-hidden p-4">
      <div className="flex gap-3.5">
        <GroupThumb src={groupThumbnailSrc(group)} alt={group.name} size={64} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-bold text-white">{group.name}</h3>
            <span className="mt-0.5 flex shrink-0 items-center gap-0.5">
              {locked ? (
                <Lock size={14} className="text-gray-500" aria-label="비공개 모임" />
              ) : null}
              <ChevronRight size={18} className="text-gray-600" />
            </span>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-gray-400">{group.intro}</p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            {isMember ? (
              <Pill tone="accent">참여 중</Pill>
            ) : null}
            {isJoinable ? (
              <Pill tone="accent">
                <Users size={12} /> 모집 중
              </Pill>
            ) : (
              <Pill tone="warn">
                <Flame size={12} /> D-{group.total - group.day} / {group.total}일
              </Pill>
            )}
            {full && <Pill tone="danger">정원 마감</Pill>}
          </div>
        </div>
      </div>

      {!isJoinable && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-[11px] text-gray-500">
            <span>{group.day}일차 진행 중</span>
            <span>{Math.round((group.day / group.total) * 100)}%</span>
          </div>
          <ProgressBar value={group.day} max={group.total} height={6} />
        </div>
      )}

      <div
        className={`mt-3 flex items-center border-t border-gray-800 pt-3 ${
          actionLabel ? "justify-between" : ""
        }`}
      >
        <StackedAvatars
          members={group.members}
          capacity={group.capacity}
          showOwnerMark={false}
        />
        {actionLabel ? (
          <span
            className={`text-xs font-semibold ${
              actionMuted ? "text-gray-500" : "text-[#00FF87]"
            }`}
          >
            {actionLabel}
          </span>
        ) : null}
      </div>
    </Card>
  );
}

export function FindTab({
  groups,
  joinedGroupIds = [],
  filter,
  onFilterChange,
  onOpenRoom,
  myUserId,
  nickname,
  isLoggedIn = false,
  loading = false,
  error = null,
  refreshing = false,
  onRefresh,
}: {
  groups: Group[];
  joinedGroupIds?: string[];
  filter: GroupFilter;
  onFilterChange: (f: GroupFilter) => void;
  onOpenRoom: (g: Group) => void;
  myUserId?: string | null;
  nickname?: string;
  isLoggedIn?: boolean;
  loading?: boolean;
  error?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<unknown>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const pullingRef = useRef(false);
  const pullYRef = useRef(0);
  const refreshingRef = useRef(refreshing);
  const onRefreshRef = useRef(onRefresh);
  const [pullY, setPullY] = useState(0);
  const [settling, setSettling] = useState(false);

  refreshingRef.current = refreshing;
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    pullYRef.current = pullY;
  }, [pullY]);

  useEffect(() => {
    if (refreshing) return;
    if (pullYRef.current <= 0) return;
    setSettling(true);
    setPullY(0);
  }, [refreshing]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !onRefresh) return;
    const scroller = findScrollParent(root);
    if (!scroller) return;

    const prevOverscroll = scroller.style.overscrollBehaviorY;
    scroller.style.overscrollBehaviorY = "contain";

    const setPull = (value: number) => {
      pullYRef.current = value;
      setPullY(value);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (refreshingRef.current) return;
      if (scroller.scrollTop > 0) {
        startYRef.current = null;
        pullingRef.current = false;
        return;
      }
      startYRef.current = event.touches[0].clientY;
      startXRef.current = event.touches[0].clientX;
      pullingRef.current = false;
      setSettling(false);
    };

    const onTouchMove = (event: TouchEvent) => {
      if (startYRef.current == null || refreshingRef.current) return;
      if (scroller.scrollTop > 0 && !pullingRef.current) {
        startYRef.current = null;
        setPull(0);
        return;
      }

      const touch = event.touches[0];
      const dy = touch.clientY - startYRef.current;
      const dx = touch.clientX - startXRef.current;

      if (!pullingRef.current) {
        if (dy < 8) return;
        if (Math.abs(dx) > dy) {
          startYRef.current = null;
          return;
        }
        pullingRef.current = true;
      }

      if (dy <= 0) {
        pullingRef.current = false;
        setPull(0);
        return;
      }

      event.preventDefault();
      setPull(dampenPull(dy));
    };

    const onTouchEnd = () => {
      if (startYRef.current == null) return;
      startYRef.current = null;
      pullingRef.current = false;
      if (pullYRef.current >= PULL_THRESHOLD) {
        setSettling(true);
        setPull(PULL_REST);
        void onRefreshRef.current?.();
        return;
      }
      setSettling(true);
      setPull(0);
    };

    scroller.addEventListener("touchstart", onTouchStart, { passive: true });
    scroller.addEventListener("touchmove", onTouchMove, { passive: false });
    scroller.addEventListener("touchend", onTouchEnd);
    scroller.addEventListener("touchcancel", onTouchEnd);

    return () => {
      scroller.style.overscrollBehaviorY = prevOverscroll;
      scroller.removeEventListener("touchstart", onTouchStart);
      scroller.removeEventListener("touchmove", onTouchMove);
      scroller.removeEventListener("touchend", onTouchEnd);
      scroller.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const mine = useMemo(() => {
    if (!isLoggedIn || !myUserId) return [];
    return listJoinedActiveGroups(
      groups,
      { userId: myUserId, nickname },
      joinedGroupIds,
    );
  }, [groups, joinedGroupIds, isLoggedIn, myUserId, nickname]);
  const myOngoing = useMemo(() => {
    if (!isLoggedIn || !myUserId) return [];
    return listJoinedOngoingGroups(
      groups,
      { userId: myUserId, nickname },
      joinedGroupIds,
    );
  }, [groups, joinedGroupIds, isLoggedIn, myUserId, nickname]);
  const joinable = useMemo(
    () => groups.filter((g) => g.filter === "joinable"),
    [groups],
  );
  const filtered =
    filter === "mine"
      ? mine
      : filter === "ongoing"
        ? myOngoing
        : joinable;
  const counts = {
    ongoing: myOngoing.length,
    joinable: joinable.length,
    mine: mine.length,
  };

  const chips: { key: GroupFilter; label: string; count: number }[] = [
    { key: "ongoing", label: "진행 중인 모임", count: counts.ongoing },
    { key: "joinable", label: "참여 가능한 모임", count: counts.joinable },
    { key: "mine", label: "내 모임", count: counts.mine },
  ];

  const pullHeight = refreshing ? Math.max(pullY, PULL_REST) : pullY;
  const pullProgress = pullHeight / PULL_THRESHOLD;
  const spinning = refreshing || pullHeight >= PULL_THRESHOLD;

  return (
    <div ref={rootRef}>
      <div
        className={`flex items-center justify-center overflow-hidden ${
          settling || refreshing ? "transition-[height] duration-300 ease-out" : ""
        }`}
        style={{ height: pullHeight }}
        aria-hidden={pullHeight <= 0}
        aria-live="polite"
        onTransitionEnd={() => {
          if (!refreshing && pullHeight <= 0) setSettling(false);
        }}
      >
        {pullHeight > 0 ? (
          <PullSpinner spinning={spinning} progress={pullProgress} />
        ) : null}
      </div>

      <div className="sticky top-0 z-20 bg-[#121316]/95 py-3 backdrop-blur">
        <div className="no-scrollbar overflow-x-auto">
          <div className="flex w-max gap-2 py-0.5 pl-4 pr-4">
            {chips.map((c) => {
              const on = filter === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => onFilterChange(c.key)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                    on
                      ? "border-[#00e599] bg-[#00e599] text-black"
                      : "border-gray-700 bg-transparent text-gray-400"
                  }`}
                >
                  {c.label}
                  <span
                    className={`rounded-full px-1.5 text-[11px] ${
                      on ? "bg-black/20 text-black" : "bg-white/10 text-gray-300"
                    }`}
                  >
                    {c.count}
                  </span>
                </button>
              );
            })}
            <span className="w-4 shrink-0" aria-hidden />
          </div>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-28 pt-1">
        {error ? (
          <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-center text-[13px] text-red-200">
            {error}
          </p>
        ) : null}
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            모임 목록을 불러오는 중
          </p>
        ) : null}
        {!loading &&
          filtered.map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            isMember={
              isLoggedIn &&
              (mine.some((item) => item.id === g.id) ||
                isGroupMember(g, { userId: myUserId, nickname }))
            }
            onOpen={onOpenRoom}
          />
        ))}
        {!loading && filtered.length === 0 && filter === "mine" && (
          <div className="rounded-2xl border border-dashed border-gray-800 bg-[#1B1D22] px-5 py-16 text-center">
            {!isLoggedIn ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-400">
                {"로그인하면 참여 중인 모임을 확인할 수 있어요.\n마이페이지에서 닉네임을 설정해 주세요."}
              </p>
            ) : (
              <>
                <p className="whitespace-pre-line text-sm leading-relaxed text-gray-400">
                  {"아직 참여 중인 모임이 없습니다.\n새로운 습관 모임에 참여하거나 직접 모임을 만들어보세요!"}
                </p>
                <p className="mt-4 inline-flex items-center gap-1 text-[12px] text-gray-500">
                  <Plus size={12} /> 하단 + 버튼으로 모임을 만들 수 있어요
                </p>
              </>
            )}
          </div>
        )}
        {!loading && filtered.length === 0 && filter === "ongoing" && (
          <div className="rounded-2xl border border-dashed border-gray-800 bg-[#1B1D22] px-5 py-16 text-center">
            {!isLoggedIn ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-400">
                {"로그인하면 진행 중인 내 모임을 확인할 수 있어요.\n마이페이지에서 닉네임을 설정해 주세요."}
              </p>
            ) : (
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-400">
                {"진행 중인 모임이 없습니다.\n참여 가능한 모임에서 새 챌린지에 합류해 보세요!"}
              </p>
            )}
          </div>
        )}
        {!loading && filtered.length === 0 && filter === "joinable" && (
          <div className="py-20 text-center text-sm text-gray-500">
            아직 모임이 없어요. <br /> 우측 하단 + 버튼으로 첫 모임을 만들어보세요!
          </div>
        )}
      </div>
    </div>
  );
}
