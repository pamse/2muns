/** 주차 숏츠 — verifications + Storage 실영상 전용 (더미/Unsplash 없음) */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { BottomSheet, Logo } from "@/app/ui";
import {
  fetchUserVerificationsInRange,
  logShortsModalSupabaseError,
  verificationVideoUrl,
} from "@/lib/verifications";
import {
  fetchVideoBlobForDownload,
  triggerMp4FileDownload,
  videoSourceTypeForUrl,
  weekHighlightDownloadFilename,
} from "@/lib/videoFormat";

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
    </svg>
  );
}

export type WeekShortClip = {
  day: number;
  title: string;
  videoUrl: string | null;
  videoPath: string | null;
};

function weekDayRange(week: number): { fromDay: number; toDay: number } {
  const w = Math.max(1, Math.floor(week));
  return { fromDay: (w - 1) * 7 + 1, toDay: w * 7 };
}

function buildWeekClips(
  week: number,
  rows: { day: number; comment: string | null; video_path: string }[],
): WeekShortClip[] {
  const { fromDay, toDay } = weekDayRange(week);
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const clips: WeekShortClip[] = [];
  for (let day = fromDay; day <= toDay; day += 1) {
    const row = byDay.get(day);
    const path = row?.video_path?.trim() ?? "";
    clips.push({
      day,
      title: row?.comment?.trim() || `DAY ${day}`,
      videoUrl: path ? verificationVideoUrl(path) : null,
      videoPath: path || null,
    });
  }
  return clips;
}

function pickDownloadClip(clips: WeekShortClip[]): WeekShortClip | null {
  const withVideo = clips.filter((c) => c.videoUrl);
  if (withVideo.length === 0) return null;
  return withVideo.reduce((best, c) => (c.day > best.day ? c : best));
}

function ShortsPreview({
  clips,
  doubleSpeed,
}: {
  clips: WeekShortClip[];
  doubleSpeed: boolean;
}) {
  const [index, setIndex] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const clip = clips[index] ?? clips[0];

  useEffect(() => {
    setIndex(0);
  }, [clips]);

  useEffect(() => {
    if (clips.length === 0) return;
    const ms = doubleSpeed ? 1500 : 3000;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % clips.length);
    }, ms);
    return () => window.clearInterval(id);
  }, [clips.length, doubleSpeed]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !clip?.videoUrl) return;
    el.playbackRate = doubleSpeed ? 2 : 1;
    void el.play().catch(() => {});
  }, [clip?.videoUrl, clip?.day, doubleSpeed]);

  if (!clip) {
    return (
      <p className="py-8 text-center text-[13px] text-gray-400">
        이번 주 인증 영상이 없습니다.
      </p>
    );
  }

  return (
    <div className="relative mx-auto w-[168px] overflow-hidden rounded-[22px] border border-white/15 bg-black shadow-[0_0_28px_#00FF8728]">
      <div className="relative aspect-[9/16]">
        {clip.videoUrl ? (
          <video
            ref={videoRef}
            key={clip.videoUrl}
            autoPlay
            muted
            playsInline
            loop
            className="absolute inset-0 h-full w-full object-cover"
          >
            <source
              src={clip.videoUrl}
              type={videoSourceTypeForUrl(clip.videoUrl)}
            />
          </video>
        ) : (
          <div className="absolute inset-0 bg-black" aria-hidden />
        )}
        {!clip.videoUrl ? (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[17px] font-extrabold tracking-wide text-white drop-shadow">
            DAY {clip.day} / 66
          </p>
        ) : null}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />
        <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/45 px-1.5 py-0.5 backdrop-blur-sm">
          <Logo className="text-[11px] tracking-wide" />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
          {clip.videoUrl ? (
            <>
              <p className="text-center text-[15px] font-extrabold tracking-wide text-white drop-shadow">
                DAY {clip.day} / 66
              </p>
              <p className="mt-0.5 text-center text-[10px] font-medium text-white/80">
                {clip.title}
              </p>
            </>
          ) : null}
          <div className="mt-2 flex gap-0.5">
            {clips.map((c, i) => (
              <span
                key={c.day}
                className={`h-0.5 flex-1 rounded-full ${
                  i === index ? "bg-[#00FF87]" : c.videoUrl ? "bg-white/45" : "bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function WeeklyShortsModal({
  open,
  onClose,
  groupId,
  userId,
  week,
}: {
  open: boolean;
  onClose: () => void;
  groupId: string;
  userId: string;
  week: number;
}) {
  const [doubleSpeed, setDoubleSpeed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [loadingClips, setLoadingClips] = useState(false);
  const [clips, setClips] = useState<WeekShortClip[]>([]);

  const verifiedCount = useMemo(
    () => clips.filter((c) => c.videoUrl).length,
    [clips],
  );

  const downloadClip = useMemo(() => pickDownloadClip(clips), [clips]);
  const actualVideoUrl = downloadClip?.videoUrl ?? null;

  useEffect(() => {
    if (!open) {
      setSaved(false);
      setActionError(null);
      return;
    }

    const gid = groupId.trim();
    const uid = userId.trim();
    const { fromDay, toDay } = weekDayRange(week);
    setClips(buildWeekClips(week, []));

    if (!gid || !uid) {
      setLoadError("모임 또는 사용자 정보를 확인할 수 없습니다.");
      setLoadingClips(false);
      return;
    }

    let cancelled = false;
    setLoadingClips(true);
    setLoadError(null);

    console.info("[WeeklyShortsModal] SELECT verifications", {
      groupId: gid,
      userId: uid,
      week,
      fromDay,
      toDay,
    });

    void fetchUserVerificationsInRange(gid, uid, fromDay, toDay)
      .then((rows) => {
        if (cancelled) return;
        console.info("[WeeklyShortsModal] loaded", rows.length, "rows", {
          days: rows.map((r) => r.day),
          paths: rows.map((r) => r.video_path),
        });
        setClips(buildWeekClips(week, rows));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setClips(buildWeekClips(week, []));
        const message =
          err instanceof Error ? err.message : "인증 영상을 불러오지 못했습니다.";
        logShortsModalSupabaseError(
          "WeeklyShortsModal.load",
          { message },
          { groupId: gid, userId: uid, fromDay, toDay, week },
        );
        setLoadError(message);
      })
      .finally(() => {
        if (!cancelled) setLoadingClips(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, groupId, userId, week]);

  async function handleDownload() {
    if (downloading) return;
    if (!actualVideoUrl) {
      window.alert("다운로드할 인증 영상이 없습니다.");
      return;
    }

    setActionError(null);
    setDownloading(true);
    try {
      const mp4Blob = await fetchVideoBlobForDownload(actualVideoUrl);
      triggerMp4FileDownload(mp4Blob, weekHighlightDownloadFilename(week));
      setSaved(true);
    } catch (err) {
      console.error("Download error:", err);
      const message =
        err instanceof Error ? err.message : "영상 저장에 실패했습니다.";
      logShortsModalSupabaseError(
        "WeeklyShortsModal.download",
        { message },
        { actualVideoUrl },
      );
      setSaved(false);
      window.alert(message);
      setActionError(message);
      window.open(actualVideoUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloading(false);
    }
  }

  async function handleShareReels() {
    if (sharing || downloading) return;
    if (!actualVideoUrl) {
      window.alert("공유할 인증 영상이 없습니다.");
      return;
    }

    setActionError(null);
    setSharing(true);
    try {
      const mp4Blob = await fetchVideoBlobForDownload(actualVideoUrl);
      const file = new File([mp4Blob], weekHighlightDownloadFilename(week), {
        type: "video/mp4",
      });
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          files: [file],
          title: `2müns ${week}주 차 숏츠`,
          text: "이번 주 인증 하이라이트",
        });
        setSaved(true);
      } else {
        await handleDownload();
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setActionError(err.message || "공유에 실패했습니다.");
      }
    } finally {
      setSharing(false);
    }
  }

  if (!open) return null;

  const durationLabel =
    verifiedCount > 0
      ? doubleSpeed
        ? `약 ${Math.max(1, Math.round((verifiedCount * 3) / 2))}초`
        : `약 ${verifiedCount * 3}초`
      : "—";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`${week}주 차 숏츠 미리보기`}
      data-shorts-source="verifications-storage"
    >
      {loadError ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-200">
          {loadError}
        </p>
      ) : null}
      {actionError ? (
        <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-[13px] text-red-200">
          {actionError}
        </p>
      ) : null}
      {saved && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-[#00FF87]/30 bg-[#00FF87]/10 px-3 py-2.5 text-[13px] font-medium leading-relaxed text-white"
        >
          기기에 성공적으로 저장되었습니다! 인스타 릴스나 유튜브 숏츠에 올려보세요.
        </p>
      )}

      {loadingClips ? (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin text-zinc-400" />
        </div>
      ) : (
        <ShortsPreview
          key={doubleSpeed ? "x2" : "x1"}
          clips={clips}
          doubleSpeed={doubleSpeed}
        />
      )}

      <div className="mt-4">
        <p className="mb-2 text-center text-[12px] text-gray-400">
          인증 영상{" "}
          <span className="font-semibold text-white">{verifiedCount}개</span>
          {verifiedCount > 0 ? (
            <>
              {" · 예상 길이 "}
              <span className="font-semibold text-white">{durationLabel}</span>
              {doubleSpeed ? " · 2배속 미리보기" : " · 1배속 미리보기"}
            </>
          ) : (
            " · 이번 주 업로드한 영상이 없습니다"
          )}
        </p>
        <div className="flex justify-center gap-2">
          <button
            type="button"
            onClick={() => setDoubleSpeed(false)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              !doubleSpeed
                ? "border-[#00FF87] bg-[#00FF87] text-black"
                : "border-gray-700 bg-transparent text-gray-400"
            }`}
          >
            1배속
          </button>
          <button
            type="button"
            onClick={() => setDoubleSpeed(true)}
            className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
              doubleSpeed
                ? "border-[#00FF87] bg-[#00FF87] text-black"
                : "border-gray-700 bg-transparent text-gray-400"
            }`}
          >
            2배속
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        <button
          type="button"
          onClick={() => void handleDownload()}
          disabled={downloading || loadingClips || verifiedCount === 0}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#00FF87] text-sm font-bold text-black transition-[filter] hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          MP4 영상 저장하기
        </button>

        <div className="rounded-xl bg-[linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)] p-[1.5px]">
          <button
            type="button"
            onClick={() => void handleShareReels()}
            disabled={sharing || downloading || loadingClips || verifiedCount === 0}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[10.5px] bg-[#1B1D22] text-sm font-bold text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <InstagramIcon />
            인스타그램 릴스로 공유
          </button>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-gray-500">
        이번 주 마지막 인증 영상을 MP4 파일로 저장합니다. 7일 합본은 추후 제공 예정입니다.
      </p>

      <p className="mt-4 text-xs leading-relaxed text-gray-400">
        ⚠️ 24시간 유예 기간이 지나면 스토리지 용량 절감을 위해 원본 영상이 자동
        파기되어 다시 다운로드할 수 없습니다.
      </p>
    </BottomSheet>
  );
}
