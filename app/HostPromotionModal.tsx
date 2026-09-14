"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Crown } from "lucide-react";

export type HostPromotionPayload = {
  noticeId: string;
  groupId: string;
  displayName: string;
};

export function parseHostPromotionNotice(content: string): Omit<HostPromotionPayload, "noticeId"> | null {
  const match = /^host_promotion:([^:]+):(.+)$/.exec(content.trim());
  if (!match) return null;
  return { groupId: match[1]!, displayName: match[2]! };
}

export function HostPromotionModal({
  open,
  displayName,
  onContinue,
  onClose,
}: {
  open: boolean;
  displayName: string;
  onContinue: () => void;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[62] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="host-promo-title"
        className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-[#00FF87]/25 bg-[#1B1D22] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
        style={{ animation: "hostPromoIn 0.24s ease-out" }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00FF87]/12">
          <Crown size={22} className="text-[#00FF87]" />
        </div>
        <h2 id="host-promo-title" className="mt-4 text-center text-lg font-bold text-white">
          끝까지 달리는 {displayName} 님, 멋져요! 👑
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-gray-400">
          기존 방장의 사정으로 모임 완주 여정이 {displayName} 님에게 이어졌습니다. 빈자리를
          채우기 위해 24시간 동안 추가 모집이 진행됩니다!
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-5 w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
        >
          이어서 달리기
        </button>
        <style>{`@keyframes hostPromoIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      </div>
    </div>,
    host,
  );
}
