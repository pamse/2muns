"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, X } from "lucide-react";
import { REPORT_REASONS, type ReportReason } from "@/lib/moderation";

export function MemberMoreButton({
  onClick,
  label = "멤버 더보기",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-white/5 hover:text-zinc-300"
    >
      <MoreVertical size={16} strokeWidth={2} />
    </button>
  );
}

export function UserActionSheet({
  open,
  nickname,
  onClose,
  onViewProfile,
  onBlock,
  onReport,
}: {
  open: boolean;
  nickname: string;
  onClose: () => void;
  onViewProfile: () => void;
  onBlock: () => void;
  onReport: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[90] flex flex-col justify-end">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 rounded-t-3xl border-t border-zinc-800 bg-[#1B1D22] px-4 pb-6 pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-600" />
        <p className="mb-3 text-center text-[13px] text-zinc-400">{nickname}</p>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => {
              onClose();
              onViewProfile();
            }}
            className="w-full rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-white hover:bg-white/5"
          >
            프로필 보기
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onBlock();
            }}
            className="w-full rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-white hover:bg-white/5"
          >
            이 사용자 차단하기
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onReport();
            }}
            className="w-full rounded-xl px-4 py-3.5 text-left text-sm font-semibold text-red-400 hover:bg-red-500/10"
          >
            사용자 신고하기
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-xl bg-zinc-800 py-3 text-sm font-semibold text-zinc-300"
        >
          취소
        </button>
      </div>
    </div>,
    host,
  );
}

export function BlockConfirmModal({
  open,
  onClose,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[95] flex items-center justify-center px-6">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/65" />
      <div className="relative z-10 w-full max-w-[340px] rounded-2xl border border-white/10 bg-[#1B1D22] p-5">
        <h2 className="text-center text-lg font-bold text-white">사용자 차단</h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-gray-400">
          이 사용자를 차단하시겠습니까? 해당 사용자의 게시물이 더 이상 보이지 않습니다.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded-xl bg-white/8 py-3 text-sm font-semibold text-gray-300"
          >
            취소
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded-xl bg-rose-500 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {busy ? "처리 중…" : "차단하기"}
          </button>
        </div>
      </div>
    </div>,
    host,
  );
}

export function ReportUserModal({
  open,
  nickname,
  onClose,
  onSubmit,
  busy = false,
}: {
  open: boolean;
  nickname: string;
  onClose: () => void;
  onSubmit: (reason: ReportReason, detail?: string) => void;
  busy?: boolean;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [reason, setReason] = useState<ReportReason>(REPORT_REASONS[0]);
  const [detail, setDetail] = useState("");

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    setReason(REPORT_REASONS[0]);
    setDetail("");
  }, [open]);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[95] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0 bg-black/65" />
      <div className="relative z-10 max-h-[85vh] w-full max-w-[420px] overflow-y-auto rounded-t-2xl border border-zinc-800 bg-[#1B1D22] p-5 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold text-white">사용자 신고</h2>
          <button type="button" onClick={onClose} aria-label="닫기" className="text-zinc-500">
            <X size={20} />
          </button>
        </div>
        <p className="mt-1 text-[13px] text-zinc-400">{nickname}님을 신고합니다.</p>
        <fieldset className="mt-4 space-y-2">
          {REPORT_REASONS.map((item) => (
            <label
              key={item}
              className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                reason === item
                  ? "border-[#00FF87]/40 bg-[#00FF87]/10 text-white"
                  : "border-zinc-800 text-zinc-300"
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                checked={reason === item}
                onChange={() => setReason(item)}
                className="accent-[#00FF87]"
              />
              {item}
            </label>
          ))}
        </fieldset>
        {reason === "기타" ? (
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value.slice(0, 200))}
            placeholder="신고 사유를 입력해 주세요"
            className="mt-3 w-full rounded-xl border border-zinc-700 bg-[#121316] px-3 py-2.5 text-sm text-white outline-none focus:border-[#00FF87]"
            rows={3}
          />
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            onSubmit(
              reason,
              reason === "기타" ? detail.trim() : undefined,
            )
          }
          className="mt-4 w-full rounded-xl bg-red-500 py-3.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {busy ? "접수 중…" : "신고 접수"}
        </button>
      </div>
    </div>,
    host,
  );
}
