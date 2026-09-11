"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export const MUNSY_WELCOME_SEEN_KEY = "has_seen_munsy_welcome";
export const MUNSY_WELCOME_PENDING_KEY = "munsy_welcome_pending";
const MUNSY_GREEN_SRC = "/images/munsy/munsy-green.png";

export function hasSeenMunsyWelcome() {
  try {
    return window.localStorage.getItem(MUNSY_WELCOME_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

export function isMunsyWelcomePending() {
  try {
    return window.localStorage.getItem(MUNSY_WELCOME_PENDING_KEY) === "true";
  } catch {
    return false;
  }
}

export function markMunsyWelcomePending() {
  try {
    window.localStorage.setItem(MUNSY_WELCOME_PENDING_KEY, "true");
  } catch {
    // 저장 실패 시에도 이번 세션에서는 모달을 띄움
  }
}

export function markMunsyWelcomeSeen() {
  try {
    window.localStorage.setItem(MUNSY_WELCOME_SEEN_KEY, "true");
    window.localStorage.removeItem(MUNSY_WELCOME_PENDING_KEY);
  } catch {
    // 저장 실패 시 다음 방문에 다시 노출될 수 있음
  }
}

export function MunsyWelcomeModal({
  open,
  nickname,
  onStart,
}: {
  open: boolean;
  nickname: string;
  onStart: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  const displayName = nickname.trim() || "친구";

  return createPortal(
    <div className="absolute inset-0 z-[62] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="munsy-welcome-title"
        className="mx-4 w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-center"
        style={{ animation: "munsyWelcomeIn 0.24s ease-out" }}
      >
        <div className="relative mx-auto flex h-44 w-44 items-center justify-center">
          <span
            className="absolute inset-6 rounded-full bg-[#00e575]/25 blur-2xl"
            aria-hidden
          />
          <img
            src={MUNSY_GREEN_SRC}
            alt="먼시"
            width={176}
            height={176}
            className="relative z-10 h-44 w-44 object-contain mix-blend-lighten drop-shadow-[0_0_20px_rgba(0,229,117,0.3)]"
          />
        </div>
        <h2
          id="munsy-welcome-title"
          className="mt-4 text-xl font-bold text-white"
        >
          반가워요, {displayName}님!
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed break-keep text-zinc-400">
          하루 단 3초면 충분해요.
          <br />
          저랑 같이 습관 만들어봐요!
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-6 w-full rounded-2xl bg-[#00E575] py-3.5 font-semibold text-black transition-all hover:brightness-110 active:scale-95"
        >
          모임 둘러보기
        </button>
        <style>{`@keyframes munsyWelcomeIn{from{opacity:0;transform:scale(.96) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      </div>
    </div>,
    host,
  );
}
