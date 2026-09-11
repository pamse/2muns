"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw, X } from "lucide-react";

type Phase = "live" | "countdown" | "recording" | "review";

const RECORD_MS = 3000;
const COMMENT_MAX = 20;

function pickRecorderOptions(): MediaRecorderOptions | undefined {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  const mimeType = types.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType, videoBitsPerSecond: 1_500_000 } : undefined;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function CameraVerifyModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { blob: Blob; videoUrl: string; comment: string }) => Promise<void> | void;
}) {
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const countdownRef = useRef<number | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recTickRef = useRef<number | null>(null);
  const reviewUrlRef = useRef<string | null>(null);
  const reviewBlobRef = useRef<Blob | null>(null);
  const armedRef = useRef(false);
  const closedRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("live");
  const [count, setCount] = useState(3);
  const [recLeft, setRecLeft] = useState(3);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const clearTimers = useCallback(() => {
    if (countdownRef.current != null) {
      window.clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (recordTimerRef.current != null) {
      window.clearTimeout(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    if (recTickRef.current != null) {
      window.clearInterval(recTickRef.current);
      recTickRef.current = null;
    }
  }, []);

  const stopRecorder = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // 이미 종료된 경우 무시
      }
    }
    recorderRef.current = null;
  }, []);

  const revokeReview = useCallback(() => {
    if (reviewUrlRef.current) {
      URL.revokeObjectURL(reviewUrlRef.current);
      reviewUrlRef.current = null;
    }
    setReviewUrl(null);
    reviewBlobRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    closedRef.current = false;
    setPhase("live");
    setCount(3);
    setRecLeft(3);
    setError(null);
    setStarting(false);
    setComment("");
    setSubmitting(false);
    armedRef.current = false;
    revokeReview();

    async function startCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("이 브라우저에서는 카메라를 사용할 수 없습니다.");
        return;
      }

      const videoConstraints: MediaTrackConstraints = {
        facingMode: { ideal: "user" },
        width: { ideal: 720 },
        height: { ideal: 1280 },
        frameRate: { ideal: 30 },
      };

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: true,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
          });
        }

        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        if (liveRef.current) {
          liveRef.current.srcObject = stream;
          await liveRef.current.play().catch(() => undefined);
        }
      } catch {
        if (!cancelled) {
          setError("카메라 권한이 필요합니다. 브라우저에서 카메라 접근을 허용해 주세요.");
        }
      }
    }

    void startCamera();

    return () => {
      cancelled = true;
      closedRef.current = true;
      clearTimers();
      stopRecorder();
      stopStream(streamRef.current);
      streamRef.current = null;
      if (liveRef.current) {
        liveRef.current.srcObject = null;
      }
      if (reviewUrlRef.current) {
        URL.revokeObjectURL(reviewUrlRef.current);
        reviewUrlRef.current = null;
      }
    };
  }, [open, clearTimers, stopRecorder, revokeReview]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) {
      setError("카메라 스트림을 찾지 못했습니다.");
      setPhase("live");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("이 브라우저에서는 영상 녹화를 지원하지 않습니다.");
      setPhase("live");
      return;
    }

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, pickRecorderOptions());
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onerror = () => {
      setError("녹화 중 오류가 발생했습니다. 다시 시도해 주세요.");
      setPhase("live");
    };

    recorder.onstop = () => {
      if (closedRef.current) return;
      const blob = new Blob(chunksRef.current, {
        type: recorder.mimeType || "video/webm",
      });
      const url = URL.createObjectURL(blob);
      if (reviewUrlRef.current) {
        URL.revokeObjectURL(reviewUrlRef.current);
      }
      reviewBlobRef.current = blob;
      reviewUrlRef.current = url;
      setReviewUrl(url);
      setPhase("review");
    };

    recorder.start();
    setPhase("recording");
    setRecLeft(3);

    recTickRef.current = window.setInterval(() => {
      setRecLeft((left) => Math.max(0, left - 1));
    }, 1000);

    recordTimerRef.current = window.setTimeout(() => {
      if (recTickRef.current != null) {
        window.clearInterval(recTickRef.current);
        recTickRef.current = null;
      }
      if (recorder.state === "recording") {
        recorder.stop();
      }
    }, RECORD_MS);
  }, []);

  function startCountdown() {
    if (phase !== "live" || starting || error || armedRef.current) return;
    armedRef.current = true;
    setStarting(true);
    setPhase("countdown");
    setCount(3);
    let remaining = 3;
    countdownRef.current = window.setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (countdownRef.current != null) {
          window.clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        setStarting(false);
        startRecording();
      } else {
        setCount(remaining);
      }
    }, 1000);
  }

  function retake() {
    clearTimers();
    stopRecorder();
    revokeReview();
    armedRef.current = false;
    setPhase("live");
    setCount(3);
    setRecLeft(3);
    setStarting(false);
    setComment("");
    reviewBlobRef.current = null;
  }

  async function confirm() {
    if (!reviewUrl || submitting) return;
    const blob = reviewBlobRef.current;
    if (!blob) {
      setError("촬영된 영상을 찾지 못했습니다. 다시 촬영해 주세요.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        blob,
        videoUrl: reviewUrl,
        comment: comment.trim().slice(0, COMMENT_MAX),
      });
      reviewUrlRef.current = null;
      reviewBlobRef.current = null;
      onClose();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "인증 저장에 실패했습니다. 다시 시도해 주세요.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const busy = phase === "countdown" || phase === "recording" || submitting;

  return (
    <div className="absolute inset-0 z-[55] flex flex-col bg-black">
      <header className="flex shrink-0 items-center justify-between px-3 py-3">
        <button
          type="button"
          onClick={() => {
            if (busy) return;
            onClose();
          }}
          disabled={busy}
          aria-label="닫기"
          className="rounded-full p-2 text-white/80 disabled:opacity-40"
        >
          <X size={22} />
        </button>
        <p className="text-sm font-semibold text-white">실시간 3초 인증</p>
        <span className="inline-block w-9" />
      </header>

      <div className="relative mx-4 min-h-0 flex-1 overflow-hidden rounded-2xl bg-[#121316]">
        <video
          ref={liveRef}
          className={`h-full w-full object-cover ${
            phase === "review" ? "hidden" : "block"
          } -scale-x-100`}
          autoPlay
          muted
          playsInline
        />
        {phase === "review" && reviewUrl ? (
          <video
            key={reviewUrl}
            src={reviewUrl}
            className="h-full w-full object-cover"
            autoPlay
            loop
            playsInline
            muted
          />
        ) : null}

        {phase === "countdown" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/35">
            <span className="text-8xl font-extrabold text-[#00FF87] drop-shadow-[0_0_24px_#00FF87]">
              {count}
            </span>
          </div>
        )}

        {phase === "recording" && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span className="text-xs font-bold text-white">REC 0:0{recLeft}</span>
          </div>
        )}

        {phase === "review" && (
          <span className="absolute left-3 top-3 rounded-md bg-black/55 px-2 py-0.5 text-[11px] font-medium text-[#00FF87]">
            3초 루프 미리보기
          </span>
        )}

        {error && (
          <div className="absolute inset-x-4 bottom-4 rounded-xl border border-red-500/30 bg-red-500/15 px-3 py-2 text-[12px] text-red-200">
            {error}
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2 px-4 pb-6 pt-4">
        {phase === "live" || phase === "countdown" || phase === "recording" ? (
          <button
            type="button"
            onClick={startCountdown}
            disabled={busy || Boolean(error)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Camera size={18} strokeWidth={2.4} />
            {phase === "countdown"
              ? "잠시 후 촬영됩니다"
              : phase === "recording"
                ? "3초 촬영 중"
                : "촬영 시작"}
          </button>
        ) : (
          <div className="space-y-2">
            <label className="block">
              <span className="sr-only">오늘의 한마디</span>
              <input
                type="text"
                value={comment}
                maxLength={COMMENT_MAX}
                placeholder="오늘의 한마디 (최대 20자)"
                onChange={(event) =>
                  setComment(event.target.value.slice(0, COMMENT_MAX))
                }
                className="w-full rounded-xl border border-white/10 bg-white/8 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-[#00e599]"
              />
              <span className="mt-1 block text-right text-[10px] tabular-nums text-slate-500">
                {comment.length}/{COMMENT_MAX}
              </span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={retake}
                disabled={submitting}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-700 bg-[#1B1D22] py-3.5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
              >
                <RotateCcw size={16} />
                다시 촬영
              </button>
              <button
                type="button"
                onClick={() => void confirm()}
                disabled={submitting}
                className="flex items-center justify-center gap-2 rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black active:scale-[0.98] disabled:opacity-70"
              >
                {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                {submitting ? "업로드 중" : "이대로 인증하기"}
              </button>
            </div>
          </div>
        )}
        <p className="text-center text-[11px] text-gray-500">
          갤러리 업로드는 불가하며, 지금 촬영한 3초 영상만 인증됩니다.
        </p>
      </div>
    </div>
  );
}
