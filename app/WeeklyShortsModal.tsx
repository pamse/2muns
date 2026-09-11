// 2müns — 주간 15초 인증 7개를 묶은 숏츠/릴스 미리보기 & 다운로드 시트
"use client";

import { useEffect, useState } from "react";
import { Download, Play } from "lucide-react";
import { BottomSheet, Logo } from "./ui";

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

const WEEK_CLIPS = [
  {
    day: 1,
    title: "미라클 모닝",
    image:
      "https://images.unsplash.com/photo-1507400492013-162706c8c05e?auto=format&fit=crop&w=400&q=80",
  },
  {
    day: 2,
    title: "홈트 15분",
    image:
      "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=400&q=80",
  },
  {
    day: 3,
    title: "집중 독서",
    image:
      "https://images.unsplash.com/photo-1476275466078-4007374efbbe?auto=format&fit=crop&w=400&q=80",
  },
  {
    day: 4,
    title: "커밋 & TIL",
    image:
      "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&w=400&q=80",
  },
  {
    day: 5,
    title: "식단 기록",
    image:
      "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80",
  },
  {
    day: 6,
    title: "데스크 루틴",
    image:
      "https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=400&q=80",
  },
  {
    day: 7,
    title: "한 주 마무리",
    image:
      "https://images.unsplash.com/photo-1507400492013-162706c8c05e?auto=format&fit=crop&w=400&q=80",
  },
];

function mockHighlightFile() {
  const payload = new Blob(
    ["2muns week 1 highlight mock"],
    { type: "video/mp4" }
  );
  return new File([payload], "2muns_week1_highlight.mp4", { type: "video/mp4" });
}

function triggerMp4Download() {
  const file = mockHighlightFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function ShortsPreview({ doubleSpeed }: { doubleSpeed: boolean }) {
  const [index, setIndex] = useState(0);
  const clip = WEEK_CLIPS[index];

  useEffect(() => {
    const ms = doubleSpeed ? 700 : 1400;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % WEEK_CLIPS.length);
    }, ms);
    return () => window.clearInterval(id);
  }, [doubleSpeed]);

  return (
    <div className="relative mx-auto w-[168px] overflow-hidden rounded-[22px] border border-white/15 bg-black shadow-[0_0_28px_#00FF8728]">
      <div className="relative aspect-[9/16]">
        <img
          key={clip.day}
          src={clip.image}
          alt={`DAY ${clip.day} / 66`}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/70" />

        <div className="absolute left-2 top-2 rounded-md bg-black/45 px-1.5 py-0.5 backdrop-blur-sm">
          <Logo className="text-[11px] tracking-wide" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur-sm">
            <Play size={16} className="ml-0.5 text-white" fill="white" />
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
          <p className="text-center text-[15px] font-extrabold tracking-wide text-white drop-shadow">
            DAY {clip.day} / 66
          </p>
          <p className="mt-0.5 text-center text-[10px] font-medium text-white/80">
            {clip.title}
          </p>
          <div className="mt-2 flex gap-0.5">
            {WEEK_CLIPS.map((c, i) => (
              <span
                key={c.day}
                className={`h-0.5 flex-1 rounded-full ${
                  i === index ? "bg-[#00FF87]" : "bg-white/25"
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
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [doubleSpeed, setDoubleSpeed] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) setSaved(false);
  }, [open]);

  function handleSaveMp4() {
    try {
      triggerMp4Download();
    } catch {
      // 브라우저가 파일 저장을 막더라도 성공 피드백은 보여 줍니다.
    }
    setSaved(true);
  }

  async function handleShareReels() {
    if (sharing) return;
    setSharing(true);
    const file = mockHighlightFile();
    try {
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({
          files: [file],
          title: "2müns 1주 차 숏츠",
          text: "이번 주 7일의 노력이 담긴 하이라이트",
        });
      } else {
        try {
          triggerMp4Download();
        } catch {
          // ignore
        }
        setSaved(true);
      }
    } catch {
      // 사용자가 공유 시트를 닫은 경우는 무시
    } finally {
      setSharing(false);
    }
  }

  if (!open) return null;

  return (
    <BottomSheet open={open} onClose={onClose} title="1주 차 숏츠 미리보기">
      {saved && (
        <p
          role="status"
          className="mb-4 rounded-xl border border-[#00FF87]/30 bg-[#00FF87]/10 px-3 py-2.5 text-[13px] font-medium leading-relaxed text-white"
        >
          기기에 성공적으로 저장되었습니다! 인스타 릴스나 유튜브 숏츠에 올려보세요.
        </p>
      )}
      <ShortsPreview key={doubleSpeed ? "x2" : "x1"} doubleSpeed={doubleSpeed} />

      <div className="mt-4">
        <p className="mb-2 text-center text-[12px] text-gray-400">
          총 길이{" "}
          <span className="font-semibold text-white">
            {doubleSpeed ? "52초" : "1분 45초"}
          </span>
          {doubleSpeed ? " · 2배속" : " · 1배속 (15초 × 7일)"}
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
            1배속 · 1:45
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
            2배속 · 0:52
          </button>
        </div>
      </div>

      <div className="mt-5 space-y-2.5">
        <button
          type="button"
          onClick={handleSaveMp4}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#00FF87] text-sm font-bold text-black transition-[filter] hover:brightness-110 active:scale-[0.98]"
        >
          <Download size={18} />
          MP4 영상 저장하기
        </button>

        <div className="rounded-xl bg-[linear-gradient(45deg,#f9ce34,#ee2a7b,#6228d7)] p-[1.5px]">
          <button
            type="button"
            onClick={handleShareReels}
            disabled={sharing}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-[10.5px] bg-[#1B1D22] text-sm font-bold text-white active:scale-[0.98] disabled:opacity-70"
          >
            <InstagramIcon />
            인스타그램 릴스로 공유
          </button>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-gray-400">
        ⚠️ 24시간 유예 기간이 지나면 스토리지 용량 절감을 위해 원본 영상이 자동
        파기되어 다시 다운로드할 수 없습니다.
      </p>
    </BottomSheet>
  );
}
