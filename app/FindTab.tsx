// 2müns — '모임찾기' 탭 (메인 홈): 필터 + 모임 카드 리스트
"use client";

import { useEffect, useRef, useState, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Flame, Loader2, Lock, Plus, RefreshCw, Users } from "lucide-react";
import { isGroupMember, type Group, type GroupFilter } from "./data";
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

const PULL_THRESHOLD = 56;

function findScrollParent(el: HTMLElement) {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const { overflowY } = window.getComputedStyle(node);
    if (overflowY === "auto" || overflowY === "scroll") return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? null;
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
  const actionLabel = isMember ? "입장하기" : isJoinable ? "참여하기" : null;
  return (
    <Card onClick={() => onOpen(group)} className="overflow-hidden p-4">
      <div className="flex gap-3.5">
        <GroupThumb src={group.cover} alt={group.name} size={68} />

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
          <span className="text-xs font-semibold text-[#00FF87]">{actionLabel}</span>
        ) : null}
      </div>
    </Card>
  );
}

export function FindTab({
  groups,
  filter,
  onFilterChange,
  onOpenRoom,
  myUserId,
  nickname,
  loading = false,
  error = null,
  refreshing = false,
  onRefresh,
}: {
  groups: Group[];
  filter: GroupFilter;
  onFilterChange: (f: GroupFilter) => void;
  onOpenRoom: (g: Group) => void;
  myUserId?: string | null;
  nickname?: string;
  loading?: boolean;
  error?: string | null;
  refreshing?: boolean;
  onRefresh?: () => void | Promise<unknown>;
}) {
  const startYRef = useRef<number | null>(null);
  const pullYRef = useRef(0);
  const [pullY, setPullY] = useState(0);

  useEffect(() => {
    pullYRef.current = pullY;
  }, [pullY]);

  useEffect(() => {
    if (!refreshing) setPullY(0);
  }, [refreshing]);

  const mine = groups.filter((g) => isGroupMember(g, { userId: myUserId, nickname }));
  const filtered =
    filter === "mine" ? mine : groups.filter((g) => g.filter === filter);
  const counts = {
    ongoing: groups.filter((g) => g.filter === "ongoing").length,
    joinable: groups.filter((g) => g.filter === "joinable").length,
    mine: mine.length,
  };

  const chips: { key: GroupFilter; label: string; count: number }[] = [
    { key: "ongoing", label: "진행 중인 모임", count: counts.ongoing },
    { key: "joinable", label: "참여 가능한 모임", count: counts.joinable },
    { key: "mine", label: "내 모임", count: counts.mine },
  ];

  const onTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const scroller = findScrollParent(event.currentTarget);
    if (scroller && scroller.scrollTop > 0) {
      startYRef.current = null;
      return;
    }
    startYRef.current = event.touches[0].clientY;
  };

  const onTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (startYRef.current == null || refreshing) return;
    const scroller = findScrollParent(event.currentTarget);
    if (scroller && scroller.scrollTop > 0) {
      startYRef.current = null;
      setPullY(0);
      return;
    }
    const dy = event.touches[0].clientY - startYRef.current;
    setPullY(dy > 0 ? Math.min(88, dy * 0.42) : 0);
  };

  const onTouchEnd = () => {
    if (startYRef.current == null) return;
    startYRef.current = null;
    if (pullYRef.current >= PULL_THRESHOLD) {
      void onRefresh?.();
      return;
    }
    setPullY(0);
  };

  const pullHeight = refreshing ? Math.max(pullY, 44) : pullY;
  const showPullSpinner = refreshing || pullY >= PULL_THRESHOLD;

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div className="sticky top-0 z-20 flex items-center gap-2 bg-[#121316]/95 px-4 py-3 backdrop-blur">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
        </div>
        {onRefresh ? (
          <button
            type="button"
            aria-label="모임 목록 새로고침"
            onClick={() => void onRefresh()}
            disabled={refreshing}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-700 text-gray-400 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-60"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : undefined} />
          </button>
        ) : null}
      </div>

      <div
        className="flex items-center justify-center overflow-hidden text-gray-500 transition-[height] duration-150"
        style={{ height: pullHeight }}
        aria-hidden={pullHeight <= 0}
      >
        {pullHeight > 0 ? (
          <Loader2
            size={18}
            className={showPullSpinner ? "animate-spin" : undefined}
            style={{ opacity: Math.min(1, pullHeight / 36) }}
          />
        ) : null}
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
            isMember={isGroupMember(g, { userId: myUserId, nickname })}
            onOpen={onOpenRoom}
          />
        ))}
        {!loading && filtered.length === 0 && filter === "mine" && (
          <div className="rounded-2xl border border-dashed border-gray-800 bg-[#1B1D22] px-5 py-16 text-center">
            <p className="whitespace-pre-line text-sm leading-relaxed text-gray-400">
              {"아직 참여 중인 모임이 없습니다.\n새로운 습관 모임에 참여하거나 직접 모임을 만들어보세요!"}
            </p>
            <p className="mt-4 inline-flex items-center gap-1 text-[12px] text-gray-500">
              <Plus size={12} /> 하단 + 버튼으로 모임을 만들 수 있어요
            </p>
          </div>
        )}
        {!loading && filtered.length === 0 && filter !== "mine" && (
          <div className="py-20 text-center text-sm text-gray-500">
            아직 모임이 없어요. <br /> 우측 하단 + 버튼으로 첫 모임을 만들어보세요!
          </div>
        )}
      </div>
    </div>
  );
}
