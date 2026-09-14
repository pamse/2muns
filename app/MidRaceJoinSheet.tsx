"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Flame, X, Zap } from "lucide-react";
import type { Group } from "./data";
import { groupThumbnailSrc } from "@/lib/categories";
import { GroupThumb, Pill } from "./ui";

export function MidRaceJoinSheet({
  open,
  group,
  onClose,
  onJoin,
  joining = false,
}: {
  open: boolean;
  group: Group | null;
  onClose: () => void;
  onJoin: (group: Group) => void;
  joining?: boolean;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !group || !host) return null;

  const full = group.members.length >= group.capacity;
  const daysLeft = Math.max(0, group.total - group.day);

  return createPortal(
    <div className="absolute inset-0 z-[56] flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mid-race-join-title"
        className="relative z-10 flex max-h-[min(88dvh,560px)] w-full flex-col rounded-t-3xl border-t border-amber-500/40 bg-[#1B1D22] shadow-[0_-12px_40px_rgba(0,0,0,0.45)] animate-[sheetUp_0.28s_ease-out]"
      >
        <div className="shrink-0 px-5 pt-3 pb-2">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-600" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="warn">
                <Zap size={12} /> 긴급 탑승 · 24시간 추가 모집
              </Pill>
              {group.day > 0 ? (
                <Pill tone="warn">
                  <Flame size={12} /> D-{daysLeft} · {group.day}일차
                </Pill>
              ) : null}
            </div>
            <button
              type="button"
              aria-label="닫기"
              onClick={onClose}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
          <div className="flex gap-3.5">
            <GroupThumb src={groupThumbnailSrc(group)} alt={group.name} size={56} />
            <div className="min-w-0 flex-1">
              <h2 id="mid-race-join-title" className="text-lg font-bold text-white">
                {group.name}
              </h2>
              {group.category ? (
                <p className="mt-1 text-[13px] text-[#00FF87]">{group.category}</p>
              ) : null}
            </div>
          </div>
          <p className="mt-5 text-[14px] leading-relaxed text-gray-200">
            현재 {group.day > 0 ? `${group.day}일차 ` : ""}
            달리는 중인 열정적인 방이에요! 지금 탑승해 남은 일정을 함께 완주하세요.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-gray-400">{group.intro}</p>
          <p className="mt-4 text-center text-[12px] text-gray-500">
            {group.members.length}/{group.capacity}명 · 빈자리{" "}
            {Math.max(0, group.capacity - group.members.length)}석
          </p>
        </div>

        <div className="shrink-0 border-t border-gray-800 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            disabled={full || joining}
            onClick={() => onJoin(group)}
            className={`w-full rounded-xl py-3.5 text-sm font-bold transition-transform active:scale-[0.98] ${
              full || joining
                ? "cursor-not-allowed bg-gray-700 text-gray-400"
                : "bg-amber-400 text-black"
            }`}
          >
            {joining ? "탑승하는 중..." : full ? "정원 마감" : "탑승하기"}
          </button>
        </div>
        <style>{`@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      </div>
    </div>,
    host,
  );
}
