// 2müns — 비로그인 유저의 참여 액션을 로그인으로 유도하는 게이트 모달
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Flame } from "lucide-react";

export const LOGIN_GATE_MESSAGE = "66일 레이스에 참여하려면 로그인이 필요해요! 🔥";

export function LoginGateModal({
  open,
  message = LOGIN_GATE_MESSAGE,
  onClose,
  onLogin,
}: {
  open: boolean;
  message?: string;
  onClose: () => void;
  onLogin: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[58] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-gate-title"
        className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#1B1D22] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
        style={{ animation: "loginGateIn 0.22s ease-out" }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00FF87]/12">
          <Flame size={22} className="text-[#00FF87]" />
        </div>
        <h2
          id="login-gate-title"
          className="mt-4 text-center text-lg font-bold text-white"
        >
          로그인이 필요해요
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-gray-400">
          {message}
        </p>
        <button
          type="button"
          onClick={onLogin}
          className="mt-5 w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
        >
          로그인하기
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full rounded-xl py-3 text-sm font-semibold text-gray-400 transition-colors active:text-white"
        >
          둘러보기 계속
        </button>
        <style>{`@keyframes loginGateIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      </div>
    </div>,
    host,
  );
}
