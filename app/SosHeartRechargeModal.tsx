"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Loader2, X } from "lucide-react";
import {
  fetchMemberHeartState,
  formatGraceCountdownWithSeconds,
  graceRemainingMs,
  GRACE_PERIOD_MS,
  MAX_SOS_HEARTS_PER_CHALLENGE,
  mockPurchaseSosHearts,
  processGraceExpulsion,
  SOS_HEART_PACKAGES,
  SOS_MODAL_FALLBACK_STATE,
  type MemberHeartState,
} from "@/lib/challengeHearts";

function resolveModalState(
  heartState: MemberHeartState | null | undefined,
): MemberHeartState {
  return heartState ?? SOS_MODAL_FALLBACK_STATE;
}

export function SosHeartRechargeModal({
  open,
  onClose,
  groupId,
  groupName,
  userId,
  heartState,
  onRecharged,
  onToast,
  onGraceExpired,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  userId: string;
  heartState: MemberHeartState | null;
  onRecharged: (state: MemberHeartState) => void;
  onToast?: (message: string) => void;
  onGraceExpired?: () => void | Promise<void>;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolvedState, setResolvedState] = useState<MemberHeartState>(() =>
    resolveModalState(heartState),
  );
  const [loading, setLoading] = useState(false);
  const [graceExpiredNotice, setGraceExpiredNotice] = useState(false);
  const fetchKeyRef = useRef<string | null>(null);
  const [localGraceStartMs, setLocalGraceStartMs] = useState<number | null>(null);
  const expiryHandledRef = useRef(false);
  const [tickMs, setTickMs] = useState(() => Date.now());
  const [graceRemainingForExpiry, setGraceRemainingForExpiry] = useState(
    GRACE_PERIOD_MS,
  );

  useEffect(() => {
    setHost(document.body);
  }, []);

  useEffect(() => {
    if (!open) {
      fetchKeyRef.current = null;
      setLocalGraceStartMs(null);
      expiryHandledRef.current = false;
      setGraceExpiredNotice(false);
      setLoading(false);
      return;
    }
    if (heartState) {
      setResolvedState(heartState);
      setLoading(false);
      if (heartState.expulsionWarningAt) {
        setLocalGraceStartMs(null);
      } else {
        setLocalGraceStartMs((prev) => prev ?? Date.now());
      }
      return;
    }

    const gid = groupId.trim();
    const uid = userId.trim();
    if (!gid || !uid) {
      setResolvedState(SOS_MODAL_FALLBACK_STATE);
      setLocalGraceStartMs((prev) => prev ?? Date.now());
      setLoading(false);
      return;
    }

    const fetchKey = `${gid}:${uid}`;
    if (fetchKeyRef.current === fetchKey) return;
    fetchKeyRef.current = fetchKey;

    let cancelled = false;
    setLoading(true);
    void fetchMemberHeartState(gid, uid)
      .then((fetched) => {
        if (cancelled) return;
        const next = fetched ?? SOS_MODAL_FALLBACK_STATE;
        setResolvedState(next);
        if (next.expulsionWarningAt) {
          setLocalGraceStartMs(null);
        } else {
          setLocalGraceStartMs((prev) => prev ?? Date.now());
        }
      })
      .catch(() => {
        if (cancelled) return;
        setResolvedState(SOS_MODAL_FALLBACK_STATE);
        setLocalGraceStartMs((prev) => prev ?? Date.now());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, groupId, userId, heartState]);

  const showGraceCountdown =
    resolvedState.status === "warning" || resolvedState.heartsRemaining <= 0;

  useEffect(() => {
    if (!open) return;
    setTickMs(Date.now());
    const id = window.setInterval(() => setTickMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open || !showGraceCountdown) return;
    setGraceRemainingForExpiry(
      graceRemainingMs(
        resolvedState.expulsionWarningAt,
        tickMs,
        localGraceStartMs,
      ),
    );
  }, [
    open,
    showGraceCountdown,
    tickMs,
    resolvedState.expulsionWarningAt,
    localGraceStartMs,
  ]);

  useEffect(() => {
    if (!open || loading || !showGraceCountdown) return;
    if (graceRemainingForExpiry > 0 || expiryHandledRef.current) return;

    const gid = groupId.trim();
    const uid = userId.trim();
    if (!gid || !uid) return;

    expiryHandledRef.current = true;
    setGraceExpiredNotice(true);

    void (async () => {
      onToast?.("유예 시간이 만료되었습니다.");
      try {
        await processGraceExpulsion({
          groupId: gid,
          userId: uid,
          groupName,
        });
      } catch (error) {
        console.error("processGraceExpulsion failed", error);
      }
      await onGraceExpired?.();
      onClose();
    })();
  }, [
    open,
    loading,
    showGraceCountdown,
    graceRemainingForExpiry,
    groupId,
    userId,
    groupName,
    onClose,
    onGraceExpired,
    onToast,
  ]);

  if (!open) return null;

  const overlayClass =
    "fixed inset-0 z-[9999] flex items-end justify-center sm:items-center";

  const portalTarget = host ?? document.body;

  if (loading) {
    return createPortal(
      <div className={overlayClass}>
        <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/70" />
        <div className="relative z-10 flex w-full max-w-[420px] items-center justify-center rounded-t-3xl border border-slate-700 bg-[#1B1D22] p-10 sm:rounded-2xl">
          <Loader2 size={28} className="animate-spin text-zinc-400" />
        </div>
      </div>,
      portalTarget,
    );
  }

  const purchased = resolvedState.heartsPurchasedCount;
  const remainingQuota = Math.max(0, MAX_SOS_HEARTS_PER_CHALLENGE - purchased);
  const atCap = purchased >= MAX_SOS_HEARTS_PER_CHALLENGE || remainingQuota <= 0;
  const inGrace = resolvedState.status === "warning";
  const remainingMs = graceRemainingMs(
    resolvedState.expulsionWarningAt,
    tickMs,
    localGraceStartMs,
  );

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
    <div className={overlayClass}>
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sos-heart-title"
        className="relative z-10 max-h-[90vh] w-full max-w-[420px] overflow-y-auto rounded-t-3xl border border-red-500/30 bg-[#1B1D22] p-5 sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-2">
          {inGrace || showGraceCountdown ? (
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

        {showGraceCountdown ? (
          <p
            key={tickMs}
            className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[13px] font-semibold text-amber-200"
          >
            {graceExpiredNotice ? (
              "유예 시간이 만료되었습니다."
            ) : (
              <span className="tabular-nums">
                퇴장까지 남은 시간: {formatGraceCountdownWithSeconds(remainingMs)}
              </span>
            )}
          </p>
        ) : null}

        <ul className="mt-4 space-y-2">
          {SOS_HEART_PACKAGES.map((pkg) => {
            const disabled =
              busy || atCap || pkg.quantity > remainingQuota || graceExpiredNotice;
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
    portalTarget,
  );
}
