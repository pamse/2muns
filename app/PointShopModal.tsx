"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, ShoppingBag, X } from "lucide-react";
import { ATTENDANCE_LIVES } from "./AttendanceStrip";
import { POINT_SPEND } from "@/lib/points";

export function PointShopModal({
  open,
  points,
  livesLeft,
  maxLives = ATTENDANCE_LIVES,
  hasSlotExpansion,
  purchasing = false,
  onClose,
  onPurchaseHeart,
  onPurchaseSlot,
}: {
  open: boolean;
  points: number;
  livesLeft: number;
  maxLives?: number;
  hasSlotExpansion: boolean;
  purchasing?: boolean;
  onClose: () => void;
  onPurchaseHeart: () => void | Promise<void>;
  onPurchaseSlot: () => void | Promise<void>;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !purchasing) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, purchasing, onClose]);

  if (!open || !host) return null;

  const heartAffordable = points >= POINT_SPEND.HEART_RECHARGE;
  const slotAffordable = points >= POINT_SPEND.SLOT_EXPANSION;
  const heartAvailable = livesLeft < maxLives;

  return createPortal(
    <div className="absolute inset-0 z-[82] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        disabled={purchasing}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="point-shop-title"
        className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-t-3xl border border-zinc-800 bg-zinc-900 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <ShoppingBag size={18} className="text-[#00FF87]" />
            <h2 id="point-shop-title" className="text-base font-bold text-white">
              포인트 상점
            </h2>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            disabled={purchasing}
            className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="rounded-xl border border-[#00FF87]/20 bg-[#00FF87]/8 px-4 py-3 text-center text-sm text-zinc-200">
            보유:{" "}
            <span className="font-extrabold text-[#00FF87]">
              {points.toLocaleString()} P
            </span>
          </p>

          <div className="mt-4 space-y-3">
            <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">💚 하트 1개 충전</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                    차감된 출석 하트를 1개 복구합니다. (최대 {maxLives}개)
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-amber-300">
                  {POINT_SPEND.HEART_RECHARGE} P
                </span>
              </div>
              <button
                type="button"
                disabled={purchasing || !heartAffordable || !heartAvailable}
                onClick={() => void onPurchaseHeart()}
                className="mt-3 w-full rounded-xl bg-[#00FF87] py-3 text-sm font-bold text-black transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {purchasing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    처리 중...
                  </span>
                ) : (
                  "충전하기"
                )}
              </button>
              {!heartAvailable ? (
                <p className="mt-2 text-center text-[11px] text-zinc-500">
                  하트가 가득 차 있어 구매할 수 없습니다.
                </p>
              ) : !heartAffordable ? (
                <p className="mt-2 text-center text-[11px] text-red-400">
                  포인트가 부족합니다.
                </p>
              ) : null}
            </article>

            <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-white">➕ 모임 슬롯 +1 확장</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-400">
                    참여 가능 모임을 3개에서 4개까지 확장합니다.
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-amber-300">
                  {POINT_SPEND.SLOT_EXPANSION} P
                </span>
              </div>
              <button
                type="button"
                disabled={purchasing || !slotAffordable || hasSlotExpansion}
                onClick={() => void onPurchaseSlot()}
                className="mt-3 w-full rounded-xl bg-[#00FF87] py-3 text-sm font-bold text-black transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {purchasing ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={16} className="animate-spin" />
                    처리 중...
                  </span>
                ) : (
                  "확장하기"
                )}
              </button>
              {hasSlotExpansion ? (
                <p className="mt-2 text-center text-[11px] text-zinc-500">
                  이미 슬롯 확장권을 사용 중입니다.
                </p>
              ) : !slotAffordable ? (
                <p className="mt-2 text-center text-[11px] text-red-400">
                  포인트가 부족합니다.
                </p>
              ) : null}
            </article>
          </div>
        </div>
      </div>
    </div>,
    host,
  );
}
