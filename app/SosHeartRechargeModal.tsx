"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  formatGraceCountdown,
  graceRemainingMs,
  MAX_SOS_HEARTS_PER_CHALLENGE,
  mockPurchaseSosHearts,
  SOS_HEART_PACKAGES,
  type MemberHeartState,
} from "@/lib/challengeHearts";

export function SosHeartRechargeModal({
  open,
  onClose,
  groupId,
  groupName,
  userId,
  heartState,
  onRecharged,
  onToast,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  userId: string;
  heartState: MemberHeartState | null;
  onRecharged: (state: MemberHeartState) => void;
  onToast?: (message: string) => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open || !host || !heartState) return null;

  const purchased = heartState.heartsPurchasedCount;
  const remainingQuota = Math.max(0, MAX_SOS_HEARTS_PER_CHALLENGE - purchased);
  const atCap = remainingQuota <= 0;
  const graceMs = graceRemainingMs(heartState.expulsionWarningAt, nowMs);

  async function buy(quantity: number) {
    if (busy || atCap || quantity > remainingQuota) return;
    setBusy(true);
    try {
      const result = await mockPurchaseSosHearts({ groupId, userId, quantity });
      onToast?.(result.message);
      if (result.ok && result.state) {
        onRecharged(result.state);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="absolute inset-0 z-[92] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl border border-red-500/30 bg-[#1B1D22] p-5 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-300">
            <AlertTriangle size={12} /> 긴급 SOS
          </span>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-zinc-500">
            <X size={20} />
          </button>
        </div>

        <h2 className="mt-4 text-xl font-bold text-white">출석 기회를 모두 소진했습니다!</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
          24시간 이내에 SOS 하트를 충전하지 않으면 모임에서 완전히 퇴장 처리되며, 지금까지의
          66일 기록이 중단됩니다.
        </p>
        <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] font-semibold text-amber-200">
          퇴장까지 남은 시간: {formatGraceCountdown(graceMs)}
        </p>
        <p className="mt-1 text-[11px] text-zinc-500">{groupName}</p>

        {atCap ? (
          <p className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-3 text-[13px] text-zinc-300">
            해당 챌린지에서 충전 가능한 최대 하트(5개)를 모두 소진했습니다.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {SOS_HEART_PACKAGES.map((pkg) => {
              const disabled = busy || pkg.quantity > remainingQuota;
              return (
                <li key={pkg.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => void buy(pkg.quantity)}
                    className="flex w-full items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900/60 px-4 py-3 text-left transition-colors hover:border-[#00FF87]/40 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span>
                      <span className="block text-sm font-semibold text-white">{pkg.title}</span>
                      <span className="text-[12px] text-zinc-500">{pkg.priceLabel}</span>
                    </span>
                    {busy ? (
                      <Loader2 size={18} className="animate-spin text-zinc-400" />
                    ) : (
                      <span className="text-[12px] font-bold text-[#00FF87]">충전</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-4 text-[11px] leading-relaxed text-zinc-500">
          ※ 2muns의 진정성을 위해 한 챌린지당 최대 5개까지만 충전할 수 있습니다.
          <br />
          현재 충전 가능 수량: {remainingQuota}개
        </p>
      </div>
    </div>,
    host,
  );
}
