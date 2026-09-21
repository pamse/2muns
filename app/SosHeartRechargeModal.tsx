"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  fetchMemberHeartState,
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
  const [resolvedState, setResolvedState] = useState<MemberHeartState | null>(
    heartState,
  );

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  useEffect(() => {
    setResolvedState(heartState);
  }, [heartState]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    if (heartState) {
      setResolvedState(heartState);
      return;
    }
    void fetchMemberHeartState(groupId, userId).then((fetched) => {
      if (!cancelled) setResolvedState(fetched);
    });
    return () => {
      cancelled = true;
    };
  }, [open, groupId, userId, heartState]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  if (!open || !host) return null;

  if (!resolvedState) {
    return createPortal(
      <div className="absolute inset-0 z-[92] flex items-end justify-center sm:items-center">
        <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/70" />
        <div className="relative z-10 flex w-full max-w-[420px] items-center justify-center rounded-t-3xl border border-slate-700 bg-[#1B1D22] p-10 sm:rounded-2xl">
          <Loader2 size={28} className="animate-spin text-zinc-400" />
        </div>
      </div>,
      host,
    );
  }

  const purchased = resolvedState.heartsPurchasedCount;
  const remainingQuota = Math.max(0, MAX_SOS_HEARTS_PER_CHALLENGE - purchased);
  const atCap = purchased >= MAX_SOS_HEARTS_PER_CHALLENGE || remainingQuota <= 0;
  const inGrace = resolvedState.status === "warning";
  const graceMs = graceRemainingMs(resolvedState.expulsionWarningAt, nowMs);

  async function buy(quantity: number) {
    if (busy || atCap || quantity > remainingQuota) return;
    const pkg = SOS_HEART_PACKAGES.find((p) => p.quantity === quantity);
    const label = pkg?.title ?? `SOS 하트 ${quantity}개`;
    const approved = window.confirm(
      `[테스트 결제] ${label}을(를) 충전하시겠습니까?\n(실제 결제는 연동되지 않았습니다.)`,
    );
    if (!approved) return;

    setBusy(true);
    try {
      const result = await mockPurchaseSosHearts({
        groupId,
        userId,
        quantity,
        skipConfirm: true,
      });
      if (result.message) onToast?.(result.message);
      if (result.ok && result.state) {
        setResolvedState(result.state);
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
        aria-labelledby="sos-heart-title"
        className="relative z-10 max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl border border-red-500/30 bg-[#1B1D22] p-5 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          {inGrace ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-[11px] font-bold text-red-300">
              <AlertTriangle size={12} /> 24시간 유예 중
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-zinc-500">{groupName}</span>
          )}
          <button type="button" onClick={onClose} aria-label="닫기" className="text-zinc-500">
            <X size={20} />
          </button>
        </div>

        <h2 id="sos-heart-title" className="mt-4 text-xl font-bold text-white">
          긴급 SOS 하트 충전
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-zinc-400">
          ※ 2muns의 진정성을 위해 챌린지당 최대 5개까지만 충전 가능합니다.
        </p>
        <p className="mt-3 rounded-xl border border-[#00FF87]/25 bg-[#00FF87]/10 px-3 py-2 text-[13px] font-semibold text-[#00FF87]">
          충전 가능 잔여: {remainingQuota}개 남음
        </p>

        {inGrace ? (
          <p className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] font-semibold text-amber-200">
            퇴장까지 남은 시간: {formatGraceCountdown(graceMs)}
          </p>
        ) : null}

        <ul className="mt-4 space-y-2">
          {SOS_HEART_PACKAGES.map((pkg) => {
            const disabled = busy || atCap || pkg.quantity > remainingQuota;
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

        {atCap ? (
          <p className="mt-4 rounded-xl border border-zinc-700 bg-zinc-900/80 px-3 py-3 text-[13px] text-zinc-300">
            해당 챌린지에서 충전 가능한 최대 하트(5개)를 모두 사용했습니다.
          </p>
        ) : null}
      </div>
    </div>,
    host,
  );
}
