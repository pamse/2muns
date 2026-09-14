"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Flame, X } from "lucide-react";
import type { Group } from "./data";
import { groupThumbnailSrc } from "@/lib/categories";
import { GroupThumb, Pill } from "./ui";

function formatVerifyRules(group: Group) {
  if (group.verifyAnytime) {
    return "24시간 자유 인증 (시간대 제한 없음)";
  }
  const start = group.verifyStartHour ?? 5;
  const end = group.verifyEndHour ?? 9;
  const pad = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return `매일 ${pad(start)} ~ ${pad(end)} 사이 15초 영상 인증`;
}

export function RunningGroupPeekSheet({
  open,
  group,
  onClose,
  onCreateFromRules,
}: {
  open: boolean;
  group: Group | null;
  onClose: () => void;
  onCreateFromRules: (group: Group) => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !group || !host) return null;

  const daysLeft = Math.max(0, group.total - group.day);
  const memberCount = group.members.length;

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
        aria-labelledby="running-peek-title"
        className="relative z-10 flex max-h-[min(90dvh,640px)] w-full flex-col rounded-t-3xl border-t border-gray-800 bg-[#1B1D22] shadow-[0_-12px_40px_rgba(0,0,0,0.45)] animate-[sheetUp_0.28s_ease-out]"
      >
        <div className="shrink-0 px-5 pt-3 pb-2">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-gray-600" aria-hidden />
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="warn">
                <Flame size={12} /> D-{daysLeft} 달리는 중
              </Pill>
              <span className="text-[13px] font-semibold text-gray-300">
                {memberCount}/{group.capacity}명
              </span>
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          <div className="flex gap-3.5">
            <GroupThumb src={groupThumbnailSrc(group)} alt={group.name} size={56} />
            <div className="min-w-0 flex-1">
              <h2 id="running-peek-title" className="text-lg font-bold text-white">
                {group.name}
              </h2>
              {group.category ? (
                <p className="mt-1 text-[13px] text-[#00FF87]">{group.category}</p>
              ) : null}
            </div>
          </div>

          <section className="mt-5">
            <h3 className="text-[13px] font-semibold text-gray-400">모임 소개</h3>
            <p className="mt-2 text-[14px] leading-relaxed text-gray-200">
              {group.intro || "소개글이 없습니다."}
            </p>
          </section>

          <section className="mt-5 rounded-2xl border border-gray-800 bg-[#121316] p-4">
            <h3 className="text-[13px] font-semibold text-gray-400">인증 주기 · 규칙</h3>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-relaxed text-gray-300">
              <li>
                <span className="font-semibold text-white">66일 레이스</span> — 현재{" "}
                <span className="text-[#00FF87]">{group.day}일차</span> / {group.total}일 진행 중
              </li>
              <li>{formatVerifyRules(group)}</li>
              <li>하루 1회 인증 · 멤버 전용 비공개 방 (시작 후 신규 참여 불가)</li>
              <li>2명 이상 모이면 방장이 66일 레이스를 시작할 수 있어요 (최대 6명)</li>
            </ul>
          </section>
        </div>

        <div className="shrink-0 border-t border-gray-800 bg-[#1B1D22] px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-[12px] leading-relaxed text-gray-500">
            이미 시작된 모임이에요. 이 규칙을 참고해 내 모임을 열어보세요!
          </p>
          <button
            type="button"
            onClick={() => onCreateFromRules(group)}
            className="mt-3 w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
          >
            이 규칙으로 만들기
          </button>
        </div>
        <style>{`@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      </div>
    </div>,
    host,
  );
}
