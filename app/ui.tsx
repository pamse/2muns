// 2müns — 공용 UI 프리미티브 컴포넌트 모음
"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Crown } from "lucide-react";
import { type Member, initial } from "./data";

/** 브랜드 로고 — 'ü'만 네온그린으로 강조 */
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`select-none text-xl font-extrabold tracking-tight text-white ${className}`}>
      2m<span className="text-[#00FF87]">ü</span>ns
    </span>
  );
}

/** 모임 대표 썸네일 — 다크 실사 + 오버레이 */
export function GroupThumb({
  src,
  alt,
  size = 64,
}: {
  src: string;
  alt: string;
  size?: number;
}) {
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-[#23262F]"
      style={{ width: size, height: size }}
      role="img"
      aria-label={alt}
    >
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="h-full w-full object-cover"
      />
      <span className="absolute inset-0 bg-black/30 backdrop-blur-[1px]" />
    </span>
  );
}

/** 원형 아바타 — 프로필 사진 + 로딩 실패 시 이니셜 폴백 */
export function Avatar({
  name,
  color,
  size = 32,
  ring = false,
  src,
}: {
  name: string;
  color: string;
  size?: number;
  ring?: boolean;
  src?: string;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [src]);

  const showImage = Boolean(src) && !broken;
  const style: CSSProperties = {
    width: size,
    height: size,
    background: color,
    fontSize: size * 0.42,
  };

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-black/80 ${
        ring ? "ring-2 ring-[#1B1D22]" : ""
      }`}
      style={style}
    >
      {showImage ? (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full rounded-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        initial(name)
      )}
    </span>
  );
}

function membersOwnerFirst(members: Member[], ownerId?: string | null) {
  if (!ownerId) return members;
  const owner = members.find((member) => member.id === ownerId);
  if (!owner) return members;
  return [owner, ...members.filter((member) => member.id !== ownerId)];
}

/** 가로로 겹쳐지는 스택 아바타 + 잔여 인원 카운트 */
export function StackedAvatars({
  members,
  capacity,
  size = 30,
  ownerId,
}: {
  members: Member[];
  capacity: number;
  size?: number;
  ownerId?: string | null;
}) {
  const ordered = membersOwnerFirst(members, ownerId);
  const shown = ordered.slice(0, 4);
  const extra = ordered.length - shown.length;
  return (
    <div className="flex items-center pt-1">
      <div className="flex -space-x-2 overflow-visible">
        {shown.map((mem) => {
          const isOwner = Boolean(ownerId && mem.id === ownerId);
          return (
            <span
              key={mem.id}
              className={`relative inline-flex shrink-0 ${isOwner ? "z-20" : "z-0"}`}
              title={isOwner ? "방장" : mem.name}
            >
              <img
                src={mem.avatar}
                alt={isOwner ? `${mem.name} (방장)` : mem.name}
                width={size}
                height={size}
                className={`relative shrink-0 rounded-full object-cover ${
                  isOwner
                    ? "ring-2 ring-[#00e599] ring-offset-2 ring-offset-[#121212]"
                    : "border-2 border-[#1B1D22]"
                }`}
                style={{ width: size, height: size }}
              />
              {isOwner ? (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#121212]">
                  <Crown
                    size={10}
                    strokeWidth={2.2}
                    className="fill-amber-300 text-amber-300"
                    aria-hidden
                  />
                </span>
              ) : null}
            </span>
          );
        })}
        {extra > 0 && (
          <span
            className="relative z-0 inline-flex items-center justify-center rounded-full border-2 border-[#1B1D22] bg-[#2A2D34] text-[11px] font-semibold text-gray-300"
            style={{ width: size, height: size }}
          >
            +{extra}
          </span>
        )}
      </div>
      <span className="ml-2 text-xs text-gray-500">
        {members.length}/{capacity}명
      </span>
    </div>
  );
}

/** 네온그린 프로그레스 바 */
export function ProgressBar({
  value,
  max,
  height = 8,
}: {
  value: number;
  max: number;
  height?: number;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div
      className="w-full overflow-hidden rounded-full bg-[#2A2D34]"
      style={{ height }}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full bg-[#00FF87] transition-all duration-700"
        style={{ width: `${pct}%`, boxShadow: "0 0 12px #00FF8799" }}
      />
    </div>
  );
}

/** 재사용 카드 컨테이너 */
export function Card({
  children,
  className = "",
  onClick,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`rounded-2xl border border-gray-800 bg-[#1B1D22] ${
        onClick ? "cursor-pointer active:scale-[0.99] transition-transform" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

/** 상태/카테고리용 필 뱃지 */
export function Pill({
  children,
  tone = "muted",
  className = "",
}: {
  children: ReactNode;
  tone?: "accent" | "muted" | "warn" | "danger";
  className?: string;
}) {
  const tones: Record<string, string> = {
    accent: "bg-[#00FF87]/15 text-[#00FF87] border-[#00FF87]/30",
    muted: "bg-white/5 text-gray-300 border-gray-700",
    warn: "bg-amber-400/15 text-amber-300 border-amber-400/30",
    danger: "bg-red-500/15 text-red-300 border-red-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** 화면 하단에서 올라오는 바텀시트 (배경 클릭 시 닫힘) */
export function BottomSheet({
  open,
  onClose,
  children,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
}) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-50 flex flex-col justify-end">
      {/* dim 배경 */}
      <button
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      {/* 시트 본문 */}
      <div className="relative z-10 w-full max-h-[90%] overflow-y-auto rounded-t-3xl border-t border-gray-800 bg-[#1B1D22] p-5 pb-8 animate-[sheetUp_0.28s_ease-out]">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-gray-700" />
        {title && <h2 className="mb-4 text-lg font-bold text-white">{title}</h2>}
        {children}
        <style>{`@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}`}</style>
      </div>
    </div>
  );
}
