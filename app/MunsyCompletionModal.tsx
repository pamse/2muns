"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const MUNSY_MINT_SRC = "/images/munsy/munsy-mint.png";

export function MunsyCompletionModal({
  open,
  groupName,
  nickname,
  goldBadge,
  onClose,
}: {
  open: boolean;
  groupName: string;
  nickname?: string;
  goldBadge?: boolean;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  const displayName = nickname?.trim() || "챌린저";
  const title = groupName.trim() || "66일 챌린지";

  return createPortal(
    <div className="absolute inset-0 z-[63] flex items-center justify-center bg-black/75 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="munsy-completion-title"
        className="mx-4 w-full max-w-sm rounded-3xl border border-[#00e599]/35 bg-zinc-900 p-6 text-center shadow-[0_24px_64px_rgba(0,255,135,0.12)]"
        style={{ animation: "munsyCompletionIn 0.28s ease-out" }}
      >
        <div className="relative mx-auto h-44 w-44 overflow-hidden rounded-[2rem] bg-zinc-900">
          <span
            className="pointer-events-none absolute inset-6 rounded-full bg-[#00e599]/35 blur-3xl"
            aria-hidden
          />
          <img
            src={MUNSY_MINT_SRC}
            alt="완주를 축하하는 먼시"
            width={176}
            height={176}
            className="relative z-10 h-44 w-44 object-contain"
          />
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-[#00e599]">
          66일 완주
        </p>
        <h2 id="munsy-completion-title" className="mt-1 text-xl font-bold text-white">
          축하해요, {displayName}님!
        </h2>
        <p className="mt-2 text-sm leading-relaxed break-keep text-zinc-400">
          「{title}」 66일 레이스를 끝까지 완주했어요.
          <br />
          {goldBadge === false
            ? "하트를 사용했지만, 끝까지 달린 당신을 응원해요!"
            : "순수 100% 달성! 전설의 푸른 불꽃을 켰어요 🏆"}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-[#00E575] py-3.5 font-semibold text-black transition-all hover:brightness-110 active:scale-95"
        >
          멋져요!
        </button>
        <style>{`@keyframes munsyCompletionIn{from{opacity:0;transform:scale(.94) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      </div>
    </div>,
    host,
  );
}
