// 2müns — 'MY' 탭: 참여 모임 관리 / 실천율 / 출석 현황 / 포인트 & 랭킹
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Loader2,
  LogOut,
  Pencil,
  ShieldCheck,
  ShoppingBag,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { PointShopModal } from "./PointShopModal";
import { validateNickname } from "./useNickname";
import {
  COMPLETED_HABIT_REWARD_POINTS,
  MAX_JOINED_GROUPS,
  SAMPLE_COMPLETED_HABITS,
  hasRaceStarted,
  listJoinedActiveGroups,
  listUserCompletedGroups,
  normalizeGroupId,
  type CompletedHabitRecord,
  type Group,
} from "./data";
import { fetchUserCompletedGroups } from "@/lib/groups";
import { AttendanceStrip, ATTENDANCE_LIVES } from "./AttendanceStrip";
import { MunsyProgressCard } from "./MunsyProgressCard";
import { PullToRefresh } from "./PullToRefresh";
import { Avatar, BottomSheet, Card, Pill } from "./ui";
import { WeeklyShortsModal } from "@/components/WeeklyShortsModal";
import {
  addDaysToKey,
  challengeDayNumber,
  countMissedChallengeDays,
  getWeeklyShortsWindow,
  localDateKey,
  resolveStartedAt,
} from "@/lib/dates";
import { fetchLiveRanking, type RankUser } from "@/lib/ranking";
import {
  SHORTS_FFMPEG_TEST_MODE,
  SHORTS_TEST_WEEK,
} from "@/lib/shortsTestMode";
import { fetchUserVerificationDays } from "@/lib/verifications";
import {
  BIO_MAX_LENGTH,
  fetchUserBio,
  updateUserBio,
} from "@/lib/moderation";
import {
  applyHeartAttendanceCheck,
  type MemberHeartState,
} from "@/lib/challengeHearts";
import { SosHeartRechargeModal } from "./SosHeartRechargeModal";
import { POINTS_UPDATED_EVENT } from "@/lib/points";
import {
  awardCompletionPoints,
  POINT_SPEND,
  purchaseHeartRecharge,
  purchaseSlotExpansion,
  type UserPointsSnapshot,
} from "@/lib/points";

function formatHms(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

const PROFILE = {
  color: "linear-gradient(135deg,#00FF87,#0ea5e9)",
};

const FEEDBACK_URL = "https://tally.so/r/A7EAdW";

const USER_GUIDE_URL =
  "https://humble-ray-f5a.notion.site/2muns-User-Manual-3da4df66ba9d807396d7f3f41721903e?source=copy_link";

const TERMS_URL =
  "https://humble-ray-f5a.notion.site/2m-ns-3da4df66ba9d80e981afc7f80e32271f";

const PRIVACY_URL =
  "https://humble-ray-f5a.notion.site/2m-ns-3da4df66ba9d80f29fb1f62e4e4d3172";

function ExternalLinkCard({ href, title }: { href: string; title: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex cursor-pointer items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 transition hover:border-zinc-700"
    >
      <span className="text-sm font-semibold text-white">{title}</span>
    </a>
  );
}

function FooterLinkCards() {
  return (
    <nav aria-label="이용 안내 및 약관" className="flex flex-col gap-2.5">
      <ExternalLinkCard href={FEEDBACK_URL} title="의견 및 오류 제보" />
      <ExternalLinkCard href={USER_GUIDE_URL} title="이용 가이드" />
      <ExternalLinkCard href={TERMS_URL} title="이용약관" />
      <ExternalLinkCard href={PRIVACY_URL} title="개인정보 처리방침" />
    </nav>
  );
}

const USE_COMPLETED_SAMPLES =
  process.env.NEXT_PUBLIC_DEMO_COMPLETED_HABITS === "1";

function formatDotDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return `${year}.${month}.${day}`;
}

function groupToCompletedHabit(group: Group): CompletedHabitRecord {
  const startedAt = resolveStartedAt(group.startedAt, group.day || group.total, new Date());
  const startKey = localDateKey(startedAt);
  const total = group.total || 66;
  const endKey = addDaysToKey(startKey, total - 1);
  return {
    id: group.id,
    name: group.name,
    startKey,
    endKey,
    points: COMPLETED_HABIT_REWARD_POINTS,
    completionRate: 100,
  };
}

function CompletedHabitsAccordion({ items }: { items: CompletedHabitRecord[] }) {
  const [open, setOpen] = useState(false);
  const count = items.length;

  return (
    <Card className="overflow-hidden border-zinc-800 bg-zinc-900 p-0">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-800/40"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden className="text-base">
            🏆
          </span>
          <span className="truncate text-sm font-semibold text-white">
            완주한 66일 습관
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-zinc-400">
          {count}개
          {open ? (
            <ChevronUp size={16} className="text-zinc-500" aria-hidden />
          ) : (
            <ChevronDown size={16} className="text-zinc-500" aria-hidden />
          )}
        </span>
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
            {count === 0 ? (
              <p className="text-[13px] leading-relaxed text-zinc-500">
                아직 완주한 습관이 없어요. 66일 완주를 향해 달려보세요!
              </p>
            ) : (
              <ul className="space-y-2.5">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <span className="shrink-0 rounded-full border border-amber-400/30 bg-gradient-to-r from-[#00FF87]/15 to-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-[#00FF87]">
                        66일 완주
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] text-zinc-400">
                      수행기간: {formatDotDate(item.startKey)} ~ {formatDotDate(item.endKey)}
                    </p>
                    <p className="mt-1 text-[12px] font-semibold text-amber-300">
                      +{item.points.toLocaleString()} P · {item.completionRate}%
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function MyPageStatsBlock({
  completedHabits,
  points,
  rank,
  onOpenShop,
}: {
  completedHabits: CompletedHabitRecord[];
  points: number;
  rank: number | null;
  onOpenShop: () => void;
}) {
  return (
    <>
      <CompletedHabitsAccordion items={completedHabits} />
      <PointsRankingSummary points={points} rank={rank} onOpenShop={onOpenShop} />
    </>
  );
}

function PointsRankingSummary({
  points,
  rank,
  onOpenShop,
}: {
  points: number;
  rank: number | null;
  onOpenShop: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-3">
      <Card className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Star size={15} className="text-[#00FF87]" />
          <span className="text-xs">획득 포인트</span>
        </div>
        <p className="text-2xl font-extrabold text-white">
          {points.toLocaleString()}
          <span className="ml-1 text-sm font-medium text-gray-500">P</span>
        </p>
      </Card>
      <Card className="flex flex-col gap-1 p-4">
        <div className="flex items-center gap-1.5 text-gray-400">
          <Trophy size={15} className="text-[#00FF87]" />
          <span className="text-xs">실시간 랭킹</span>
        </div>
        <p className="text-2xl font-extrabold text-white">
          {rank != null ? (
            <>
              {rank}
              <span className="ml-0.5 text-sm font-medium text-gray-500">위</span>
            </>
          ) : (
            "-"
          )}
        </p>
      </Card>
      </div>
      <button
        type="button"
        onClick={onOpenShop}
        className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-xs font-semibold text-zinc-300 transition-colors hover:border-[#00FF87]/35 hover:text-white"
      >
        <ShoppingBag size={14} className="text-[#00FF87]" />
        포인트 상점 · 아이템 교환소
      </button>
    </div>
  );
}

function ProfilePhotoButton({
  src,
  name,
  uploading = false,
  onSelectFile,
}: {
  src: string | null;
  name: string;
  uploading?: boolean;
  onSelectFile: (file: File) => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) {
      onSelectFile(file);
    }
  }

  return (
    <button
      type="button"
      onClick={openPicker}
      aria-label="프로필 사진 변경"
      disabled={uploading}
      className="group relative shrink-0 disabled:opacity-80"
    >
      <span className="relative block">
        <Avatar name={name} color={PROFILE.color} src={src ?? undefined} size={56} />
        <span className="pointer-events-none absolute inset-0 rounded-full bg-black/0 transition-colors group-hover:bg-black/45" />
        {uploading ? (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
            <Loader2 size={18} className="animate-spin text-white" />
          </span>
        ) : null}
      </span>
      <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#00FF87] text-black ring-2 ring-[#121316] transition group-hover:scale-110 group-hover:bg-[#4dffaa]">
        <Camera size={11} strokeWidth={2.4} />
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={handleChange}
      />
    </button>
  );
}

function QuitChallengeModal({
  open,
  quitting = false,
  onClose,
  onConfirm,
}: {
  open: boolean;
  quitting?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !quitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, quitting, onClose]);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[80] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        disabled={quitting}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm disabled:cursor-not-allowed"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quit-challenge-title"
        className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#1B1D22] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
        style={{ animation: "entryDeniedIn 0.22s ease-out" }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/12">
          <AlertTriangle size={22} className="text-red-400" />
        </div>
        <h2
          id="quit-challenge-title"
          className="mt-4 text-center text-lg font-bold text-white"
        >
          챌린지를 포기하시겠습니까?
        </h2>
        <p className="mt-2 text-center text-[13px] leading-relaxed text-gray-400">
          퇴장 시 현재까지의 진행 기록이 초기화되며 모임에서 제외됩니다.
        </p>
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={quitting}
            className="flex-1 rounded-xl border border-zinc-700 bg-zinc-900 py-3.5 text-sm font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-60"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={quitting}
            className="flex-1 rounded-xl bg-red-500 py-3.5 text-sm font-bold text-white transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            {quitting ? "처리 중..." : "포기하기(퇴장)"}
          </button>
        </div>
      </div>
      <style>{`@keyframes entryDeniedIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>,
    host,
  );
}

const MUNSY_YELLOW_SRC = "/images/munsy/munsy-yellow.png";

function WithdrawRetentionModal({
  open,
  userPoints,
  withdrawing = false,
  onClose,
  onConfirmWithdraw,
}: {
  open: boolean;
  userPoints: number;
  withdrawing?: boolean;
  onClose: () => void;
  onConfirmWithdraw: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const formattedPoints = `${Math.max(0, userPoints).toLocaleString()}P`;

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !withdrawing) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, withdrawing, onClose]);

  if (!open || !host) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="withdraw-retention-title"
        className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-center shadow-2xl"
        style={{ animation: "withdrawRetentionIn 0.24s ease-out" }}
      >
        <div className="relative mx-auto h-24 w-24 overflow-hidden rounded-[1.75rem] bg-zinc-900">
          <span
            className="pointer-events-none absolute inset-4 rounded-full bg-orange-500/25 blur-2xl"
            aria-hidden
          />
          <img
            src={MUNSY_YELLOW_SRC}
            alt="먼시"
            width={96}
            height={96}
            className="relative h-full w-full object-contain"
          />
        </div>
        <h2
          id="withdraw-retention-title"
          className="mt-3 text-lg font-bold text-white"
        >
          🔥 &quot;정말 먼시의 불꽃을 끌 건가요...?&quot;
        </h2>
        <p className="mt-3 break-keep text-sm leading-relaxed text-zinc-300">
          작은 불씨였던 제가 여기까지 자란 건 당신 덕분이에요.
          <br />
          지금 떠나시면{" "}
          <span className="font-semibold text-white">함께 밝힌 습관의 불꽃</span>
          과{" "}
          <span className="font-semibold text-emerald-400">{formattedPoints}</span>
          가 영영 사라져요.
          <br />
          <br />
          완벽하지 않아도 괜찮아요. 우리 하루만 더 같이 있어 봐요.
        </p>
        <button
          type="button"
          onClick={onClose}
          disabled={withdrawing}
          className="mt-5 w-full rounded-xl bg-emerald-500 py-3.5 text-sm font-semibold text-black transition hover:bg-emerald-400 disabled:opacity-60"
        >
          하루만 더 해볼게요 (머무르기)
        </button>
        <button
          type="button"
          onClick={onConfirmWithdraw}
          disabled={withdrawing}
          className="mt-2 w-full py-2 text-xs text-zinc-500 underline underline-offset-4 transition hover:text-red-400 disabled:opacity-60"
        >
          {withdrawing ? "탈퇴 처리 중..." : "모든 불꽃을 끄고 탈퇴하기"}
        </button>
      </div>
      <style>{`@keyframes withdrawRetentionIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>,
    host,
  );
}

function NicknameLimitModal({
  open,
  daysLeft,
  onClose,
}: {
  open: boolean;
  daysLeft: number;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  if (!open || !host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[55] flex items-center justify-center px-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="nickname-limit-title"
        className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-2xl border border-white/10 bg-[#1B1D22] p-5 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
        style={{ animation: "nickLimitIn 0.22s ease-out" }}
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00FF87]/10">
          <Clock size={22} className="text-[#00FF87]" />
        </div>
        <h2
          id="nickname-limit-title"
          className="mt-4 text-center text-lg font-bold text-white"
        >
          닉네임 변경 제한
        </h2>
        <p className="mt-2 whitespace-pre-line text-center text-[13px] leading-relaxed text-gray-400">
          {"닉네임은 14일 동안 최대 2회만 변경할 수 있습니다.\n신중한 커뮤니티 활동 및 신뢰 유지를 위한 정책입니다."}
        </p>
        <div className="mt-4 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#00FF87]/30 bg-[#00FF87]/10 px-3 py-1.5 text-[12px] font-semibold text-[#00FF87]">
            <Clock size={12} strokeWidth={2.4} />
            약 {daysLeft}일 후에 다시 변경할 수 있습니다.
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
        >
          확인
        </button>
        <style>{`@keyframes nickLimitIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
      </div>
    </div>,
    host,
  );
}

function WarningBadge({
  miss,
  heartStatus,
  livesLeft,
}: {
  miss: number;
  heartStatus?: "active" | "warning" | "kicked";
  livesLeft?: number;
}) {
  const depleted = (livesLeft ?? ATTENDANCE_LIVES) <= 0;
  const inGrace = heartStatus === "warning" || (depleted && heartStatus !== "kicked");

  if (inGrace && heartStatus === "warning") {
    return (
      <Pill tone="danger">
        <AlertTriangle size={12} /> ⚠️ 퇴장 위기 (24시간 남음)
      </Pill>
    );
  }
  if (depleted || miss >= 3)
    return (
      <Pill tone="danger">
        <AlertTriangle size={12} /> 출석 기회 소진
      </Pill>
    );
  if (miss === 2)
    return (
      <Pill tone="warn">
        <AlertTriangle size={12} /> 2회 누락 · 경고
      </Pill>
    );
  return (
    <Pill tone="accent">
      <ShieldCheck size={12} /> 정상 참여 중
    </Pill>
  );
}

function groupProgress(
  group: Group,
  verifiedDays: ReadonlySet<number>,
  now = new Date(),
) {
  const startedAt = resolveStartedAt(group.startedAt, group.day, now);
  const dayCount = challengeDayNumber(startedAt, now, group.total);
  const missCount = countMissedChallengeDays(dayCount, verifiedDays);
  return {
    startedAt,
    achievedDays: dayCount,
    totalDays: group.total,
    missCount,
    streak: dayCount,
    verifiedDays,
  };
}

export function MyTab({
  onGoFind,
  onOpenRoom,
  onQuitGroup,
  onLogout,
  onWithdrawAccount,
  groups,
  joinedGroupIds,
  myUserId,
  nickname,
  remainingNicknameChanges,
  nicknameLockDays,
  onChangeNickname,
  myProfileImage,
  onSelectProfileImage,
  profileImageUploading = false,
  userPoints = 0,
  extraGroupSlots = 0,
  maxJoinedGroups = MAX_JOINED_GROUPS,
  heartBonusByGroup = {},
  onPointsToast,
  onPointsSnapshot,
  onRefreshPoints,
  onRunGraceExpulsionChecks,
}: {
  onGoFind: () => void;
  onOpenRoom: (group: Group) => void;
  onQuitGroup: (groupId: string) => void | Promise<void>;
  onLogout: () => void;
  onWithdrawAccount: () => void | Promise<void>;
  groups: Group[];
  joinedGroupIds?: string[];
  myUserId?: string | null;
  nickname: string;
  remainingNicknameChanges: number;
  nicknameLockDays: number;
  onChangeNickname: (next: string) => Promise<void>;
  myProfileImage: string | null;
  onSelectProfileImage: (file: File) => void | Promise<void>;
  profileImageUploading?: boolean;
  userPoints?: number;
  extraGroupSlots?: number;
  maxJoinedGroups?: number;
  heartBonusByGroup?: Record<string, number>;
  onPointsToast?: (message: string) => void;
  onPointsSnapshot?: (snapshot: UserPointsSnapshot) => void;
  onRefreshPoints?: () => Promise<UserPointsSnapshot | void>;
  onRunGraceExpulsionChecks?: () => void | Promise<void>;
}) {
  const joinedGroups = useMemo(
    () =>
      listJoinedActiveGroups(
        groups,
        { userId: myUserId, nickname },
        joinedGroupIds,
      ),
    [groups, joinedGroupIds, myUserId, nickname],
  );
  const myGroups = useMemo(
    () => joinedGroups.slice(0, maxJoinedGroups),
    [joinedGroups, maxJoinedGroups],
  );
  const [selectedId, setSelectedId] = useState(myGroups[0]?.id ?? "");
  const [showPointShop, setShowPointShop] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [showQuit, setShowQuit] = useState(false);
  const [quitting, setQuitting] = useState(false);
  const [dismissedShortsKey, setDismissedShortsKey] = useState<string | null>(null);
  const [showShortsModal, setShowShortsModal] = useState(false);
  const [showNickEdit, setShowNickEdit] = useState(false);
  const [showNickLimit, setShowNickLimit] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingNickname, setSavingNickname] = useState(false);
  const [bio, setBio] = useState("");
  const [showBioEdit, setShowBioEdit] = useState(false);
  const [editBio, setEditBio] = useState("");
  const [savingBio, setSavingBio] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [verifiedState, setVerifiedState] = useState<{
    groupId: string;
    days: number[];
  } | null>(null);
  const [fetchedCompletedGroups, setFetchedCompletedGroups] = useState<Group[]>([]);
  const [liveRanking, setLiveRanking] = useState<{
    topFive: RankUser[];
    rank: number | null;
  }>({ topFive: [], rank: null });
  const [refreshing, setRefreshing] = useState(false);
  const [heartState, setHeartState] = useState<MemberHeartState | null>(null);
  const [showSosModal, setShowSosModal] = useState(false);
  const autoSosForWarningKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (myGroups.length === 0) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!myGroups.some((group) => group.id === selectedId)) {
      setSelectedId(myGroups[0].id);
    }
  }, [myGroups, selectedId]);

  const selected = myGroups.find((group) => group.id === selectedId) ?? myGroups[0] ?? null;
  const started = selected ? hasRaceStarted(selected) : false;
  const recruiting = Boolean(selected && !started);

  useEffect(() => {
    if (!started) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [started, selected?.id]);

  useEffect(() => {
    if (!myUserId) {
      setBio("");
      return;
    }
    void fetchUserBio(myUserId).then(setBio);
  }, [myUserId]);

  useEffect(() => {
    if (!myUserId) {
      setFetchedCompletedGroups([]);
      return;
    }
    let cancelled = false;
    void fetchUserCompletedGroups(myUserId, nickname)
      .then((rows) => {
        if (!cancelled) setFetchedCompletedGroups(rows);
      })
      .catch((error) => {
        console.error("completed groups fetch failed", error);
        if (!cancelled) setFetchedCompletedGroups([]);
      });
    return () => {
      cancelled = true;
    };
  }, [myUserId, nickname]);

  useEffect(() => {
    if (!selected?.id || !started || !myUserId) return;
    const groupId = selected.id;
    let cancelled = false;
    void fetchUserVerificationDays(groupId, myUserId)
      .then((days) => {
        if (!cancelled) setVerifiedState({ groupId, days });
      })
      .catch((error) => {
        console.error("verification days fetch failed", error);
        if (!cancelled) setVerifiedState({ groupId, days: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, started, myUserId]);

  const now = useMemo(() => new Date(nowMs), [nowMs]);
  const verifiedDays = useMemo(() => {
    if (!selected || !started || verifiedState?.groupId !== selected.id) {
      return new Set<number>();
    }
    return new Set(verifiedState.days);
  }, [selected, started, verifiedState]);
  const progress = selected && started ? groupProgress(selected, verifiedDays, now) : null;
  const shortsWindow =
    selected && started
      ? getWeeklyShortsWindow(resolveStartedAt(selected.startedAt, selected.day, now), now)
      : null;
  const shortsKey = shortsWindow && selected ? `${selected.id}:${shortsWindow.week}` : null;
  const purgeLeft = shortsWindow
    ? Math.max(0, Math.round((shortsWindow.expiresAt - nowMs) / 1000))
    : 0;
  const showShortsBanner = Boolean(
    shortsWindow && purgeLeft > 0 && shortsKey && dismissedShortsKey !== shortsKey,
  );
  const canAdd = myGroups.length < maxJoinedGroups;

  const loadRanking = useCallback(
    async (points = userPoints) => {
      const next = await fetchLiveRanking({
        userId: myUserId,
        points,
      });
      setLiveRanking(next);
      return next;
    },
    [myUserId, userPoints],
  );

  useEffect(() => {
    void loadRanking();
  }, [loadRanking]);

  useEffect(() => {
    if (!myUserId) return;
    const onPointsUpdated = (event: Event) => {
      const detail = (
        event as CustomEvent<{ userId: string; snapshot: { points: number } }>
      ).detail;
      const points =
        detail?.userId === myUserId ? detail.snapshot.points : userPoints;
      void fetchLiveRanking({ userId: myUserId, points }).then(setLiveRanking);
    };
    window.addEventListener(POINTS_UPDATED_EVENT, onPointsUpdated);
    return () => window.removeEventListener(POINTS_UPDATED_EVENT, onPointsUpdated);
  }, [myUserId, userPoints]);

  const handleRefresh = useCallback(async () => {
    await onRunGraceExpulsionChecks?.();
    setRefreshing(true);
    try {
      const snapshot = await onRefreshPoints?.();
      const points = snapshot?.points ?? userPoints;

      const tasks: Promise<unknown>[] = [loadRanking(points)];

      if (myUserId) {
        tasks.push(
          fetchUserCompletedGroups(myUserId, nickname).then((rows) => {
            setFetchedCompletedGroups(rows);
          }),
        );
      }

      if (selected?.id && started && myUserId) {
        tasks.push(
          fetchUserVerificationDays(selected.id, myUserId).then((days) => {
            setVerifiedState({ groupId: selected.id, days });
          }),
        );
      }

      await Promise.all(tasks);
    } catch (error) {
      console.error("my tab refresh failed", error);
    } finally {
      setRefreshing(false);
    }
  }, [
    loadRanking,
    myUserId,
    nickname,
    onRefreshPoints,
    onRunGraceExpulsionChecks,
    selected?.id,
    started,
    userPoints,
  ]);

  const myStats = useMemo(
    () => ({
      points: userPoints,
      rank: userPoints <= 0 ? null : liveRanking.rank,
    }),
    [userPoints, liveRanking.rank],
  );
  const selectedHeartBonus = selected
    ? heartBonusByGroup[normalizeGroupId(selected.id)] ?? 0
    : 0;
  const computedLivesLeft = progress
    ? Math.min(
        ATTENDANCE_LIVES,
        ATTENDANCE_LIVES - progress.missCount + selectedHeartBonus,
      )
    : ATTENDANCE_LIVES;
  const livesLeft =
    heartState && heartState.status !== "kicked"
      ? heartState.heartsRemaining
      : computedLivesLeft;

  const sosModalHeartState = useMemo((): MemberHeartState | null => {
    if (heartState && heartState.status !== "kicked") {
      return heartState;
    }
    if (!started || livesLeft > 0) return null;
    return {
      heartsRemaining: 0,
      heartsPurchasedCount: 0,
      usedPaidHeart: false,
      expulsionWarningAt: heartState?.expulsionWarningAt ?? null,
      status: "warning",
    };
  }, [
    heartState?.expulsionWarningAt,
    heartState?.heartsPurchasedCount,
    heartState?.heartsRemaining,
    heartState?.status,
    livesLeft,
    started,
  ]);

  const openSosModal = useCallback(() => {
    setShowSosModal(true);
  }, []);

  const onRunGraceExpulsionChecksRef = useRef(onRunGraceExpulsionChecks);
  onRunGraceExpulsionChecksRef.current = onRunGraceExpulsionChecks;

  const heartSyncKey = selected?.id && myUserId && started && progress
    ? `${selected.id}:${myUserId}:${progress.missCount}:${selectedHeartBonus}`
    : null;

  useEffect(() => {
    if (!heartSyncKey || !selected || !myUserId || !progress) {
      setHeartState(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      await onRunGraceExpulsionChecksRef.current?.();
      if (cancelled) return;
      const synced = await applyHeartAttendanceCheck({
        groupId: selected.id,
        userId: myUserId,
        groupName: selected.name,
        missCount: progress.missCount,
        pointHeartBonus: selectedHeartBonus,
      });
      if (cancelled) return;
      setHeartState(synced);
    })();
    return () => {
      cancelled = true;
    };
  }, [heartSyncKey, myUserId, progress?.missCount, selected?.id, selected?.name, selectedHeartBonus]);

  useEffect(() => {
    autoSosForWarningKeyRef.current = null;
  }, [selected?.id]);

  useEffect(() => {
    if (!selected?.id) return;
    if (!myGroups.some((group) => group.id === selected.id)) {
      setShowSosModal(false);
      setHeartState(null);
    }
  }, [myGroups, selected?.id]);

  useEffect(() => {
    if (!selected?.id || !started || livesLeft > 0) return;

    const inDbGrace =
      heartState?.status === "warning" && Boolean(heartState.expulsionWarningAt);
    const key = inDbGrace
      ? `${selected.id}:${heartState!.expulsionWarningAt}`
      : `${selected.id}:depleted:${progress?.missCount ?? 0}`;

    if (autoSosForWarningKeyRef.current === key) return;
    autoSosForWarningKeyRef.current = key;
    setShowSosModal(true);
  }, [
    selected?.id,
    started,
    livesLeft,
    heartState?.status,
    heartState?.expulsionWarningAt,
    progress?.missCount,
  ]);

  const completedHabits = useMemo(() => {
    const merged = new Map<string, Group>();
    for (const group of listUserCompletedGroups(groups, {
      userId: myUserId,
      nickname,
    })) {
      merged.set(normalizeGroupId(group.id), group);
    }
    for (const group of fetchedCompletedGroups) {
      merged.set(normalizeGroupId(group.id), group);
    }
    const records = [...merged.values()].map(groupToCompletedHabit);
    if (records.length > 0) return records;
    return USE_COMPLETED_SAMPLES ? SAMPLE_COMPLETED_HABITS : [];
  }, [groups, fetchedCompletedGroups, myUserId, nickname]);

  useEffect(() => {
    if (!myUserId) return;
    const realGroups = listUserCompletedGroups(groups, {
      userId: myUserId,
      nickname,
    });
    for (const group of [...realGroups, ...fetchedCompletedGroups]) {
      void awardCompletionPoints(myUserId, group.id).then((result) => {
        if (result && result.totalAwarded > 0) {
          onPointsToast?.(result.messages.join(" · "));
        }
      });
    }
  }, [groups, fetchedCompletedGroups, myUserId, nickname, onPointsToast]);

  async function handlePurchaseHeart() {
    if (!myUserId || !selected || purchasing) return;
    setPurchasing(true);
    try {
      const result = await purchaseHeartRecharge(
        myUserId,
        selected.id,
        livesLeft,
        ATTENDANCE_LIVES,
      );
      if (!result.ok) {
        onPointsToast?.(result.message);
        return;
      }
      if (result.snapshot) onPointsSnapshot?.(result.snapshot);
      onPointsToast?.(`-${POINT_SPEND.HEART_RECHARGE}P · ${result.message}`);
      setShowPointShop(false);
    } finally {
      setPurchasing(false);
    }
  }

  async function handlePurchaseSlot() {
    if (!myUserId || purchasing) return;
    setPurchasing(true);
    try {
      const result = await purchaseSlotExpansion(myUserId);
      if (!result.ok) {
        onPointsToast?.(result.message);
        return;
      }
      if (result.snapshot) onPointsSnapshot?.(result.snapshot);
      onPointsToast?.(`-${POINT_SPEND.SLOT_EXPANSION}P · ${result.message}`);
      setShowPointShop(false);
    } finally {
      setPurchasing(false);
    }
  }

  async function handleQuit() {
    if (!selected || quitting) return;
    setQuitting(true);
    try {
      await onQuitGroup(selected.id);
      setShowQuit(false);
    } catch {
      // 부모에서 토스트/재동기화 처리
    } finally {
      setQuitting(false);
    }
  }

  function openNicknameEditor() {
    if (remainingNicknameChanges <= 0) {
      setShowNickLimit(true);
      return;
    }
    setEditNickname(nickname);
    setEditError(null);
    setShowNickEdit(true);
  }

  async function handleLogout() {
    if (loggingOut || withdrawing) return;
    const confirmed = window.confirm("로그아웃 하시겠습니까?");
    if (!confirmed) return;
    setLoggingOut(true);
    onLogout();
  }

  function openWithdrawModal() {
    if (withdrawing || loggingOut) return;
    setShowWithdrawModal(true);
  }

  async function confirmWithdrawAccount() {
    if (withdrawing || loggingOut) return;
    setWithdrawing(true);
    try {
      await onWithdrawAccount();
    } catch (error) {
      console.error("account withdrawal failed", error);
      window.alert("회원 탈퇴에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      setWithdrawing(false);
    }
  }

  function openBioEditor() {
    setEditBio(bio);
    setBioError(null);
    setShowBioEdit(true);
  }

  async function saveBioEdit() {
    if (!myUserId) return;
    setSavingBio(true);
    setBioError(null);
    try {
      const saved = await updateUserBio(myUserId, editBio);
      setBio(saved);
      setShowBioEdit(false);
    } catch (error) {
      setBioError(
        error instanceof Error ? error.message : "한 줄 소개를 저장하지 못했습니다.",
      );
    } finally {
      setSavingBio(false);
    }
  }

  async function saveNicknameEdit() {
    const errorMessage = validateNickname(editNickname);
    if (errorMessage) {
      setEditError(errorMessage);
      return;
    }
    setSavingNickname(true);
    setEditError(null);
    try {
      await onChangeNickname(editNickname);
      setShowNickEdit(false);
    } catch (error) {
      setEditError(
        error instanceof Error ? error.message : "닉네임을 변경하지 못했습니다.",
      );
    } finally {
      setSavingNickname(false);
    }
  }

  return (
    <PullToRefresh
      refreshing={refreshing}
      onRefresh={handleRefresh}
      className="space-y-5 px-4 pb-28 pt-4"
    >
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-3">
        <ProfilePhotoButton
          src={myProfileImage}
          name={nickname || "나"}
          uploading={profileImageUploading}
          onSelectFile={onSelectProfileImage}
        />
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <h1 className="text-lg font-bold text-white">{nickname || "닉네임"}</h1>
            <button
              type="button"
              onClick={openNicknameEditor}
              aria-label="닉네임 수정"
              className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
            >
              <Pencil size={14} strokeWidth={2.2} />
            </button>
            {selected && started ? (
              <WarningBadge
                miss={progress?.missCount ?? 0}
                heartStatus={heartState?.status}
                livesLeft={livesLeft}
              />
            ) : null}
          </div>
          <div className="mt-1 flex items-start gap-1">
            <button
              type="button"
              onClick={openBioEditor}
              className="min-w-0 flex-1 text-left text-[13px] leading-snug text-gray-400 transition-colors hover:text-gray-300"
            >
              {bio.trim()
                ? bio
                : "나를 소개하는 한 줄을 남겨보세요"}
            </button>
            <button
              type="button"
              onClick={openBioEditor}
              aria-label="한 줄 소개 수정"
              className="mt-0.5 shrink-0 rounded-full p-1 text-gray-500 hover:bg-white/5 hover:text-white"
            >
              <Pencil size={12} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      </div>

      {/* 참여 중인 챌린지 칩 */}
      <section>
        <p className="mb-2 px-1 text-sm font-bold text-gray-300">
          참여 중인 챌린지 ({myGroups.length}/{maxJoinedGroups}개)
          {extraGroupSlots > 0 ? (
            <span className="ml-1 text-[11px] font-medium text-[#00FF87]">
              · 슬롯 +{extraGroupSlots}
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {myGroups.map((group) => {
            const on = selected?.id === group.id;
            const waiting = !hasRaceStarted(group);
            return (
              <button
                key={group.id}
                onClick={() => setSelectedId(group.id)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  on
                    ? "border-[#00FF87] bg-[#00FF87] text-black"
                    : "border-gray-700 bg-transparent text-gray-400"
                }`}
              >
                {waiting ? (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      on ? "bg-black/55" : "bg-amber-300"
                    }`}
                    aria-hidden
                  />
                ) : null}
                {group.name}
                {waiting ? (
                  <span className={`text-[10px] font-bold ${on ? "text-black/70" : "text-amber-300"}`}>
                    대기
                  </span>
                ) : null}
              </button>
            );
          })}
          {canAdd && (
            <button
              onClick={onGoFind}
              className="rounded-full border border-dashed border-gray-600 px-2.5 py-1.5 text-[12px] font-medium text-gray-400 transition-colors hover:border-gray-400 hover:text-gray-200"
            >
              + 모임 추가
            </button>
          )}
        </div>
      </section>

      {/* TODO: TEST_MODE_BYPASS — FFmpeg API 실기기 검증용 1주차 모달 진입 */}
      {selected && started && SHORTS_FFMPEG_TEST_MODE ? (
        <button
          type="button"
          onClick={() => setShowShortsModal(true)}
          className="w-full rounded-xl border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-left text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/15"
        >
          [테스트] {SHORTS_TEST_WEEK}주차 숏츠 열기 (유예·만료 무시)
        </button>
      ) : null}

      {selected && started && showShortsBanner && shortsWindow ? (
        <div className="relative overflow-hidden rounded-2xl border border-[#00FF87]/40 bg-gradient-to-r from-[#1B1D22] to-[#121316] p-4">
          <button
            type="button"
            onClick={() => setDismissedShortsKey(shortsKey)}
            aria-label="배너 닫기"
            className="absolute right-3 top-3 rounded-full p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
          >
            <X size={16} />
          </button>
          <span className="inline-flex rounded-full bg-[#00FF87]/15 px-2.5 py-0.5 text-xs font-semibold text-[#00FF87]">
            🔥 {shortsWindow.week}주 차 숏츠 생성 완료
          </span>
          <p className="mt-2 font-mono text-[13px] font-semibold tabular-nums text-amber-300">
            {`⏳ 파기까지 ${formatHms(purgeLeft)} 남음`}
          </p>
          <p className="mt-1.5 pr-6 text-[12px] leading-relaxed text-gray-400">
            이번 주 7일의 노력이 담긴 숏폼 클립이 완성되었어요. 24시간 후 서버에서
            영구 삭제됩니다.
          </p>
          <button
            type="button"
            onClick={() => setShowShortsModal(true)}
            className="mt-3 rounded-xl bg-[#00FF87] px-4 py-2 text-sm font-bold text-black transition-[filter] hover:brightness-110"
          >
            지금 영상 다운로드
          </button>
        </div>
      ) : null}

      {selected && started && progress ? (
        <>
          <MunsyProgressCard
            currentDays={progress.achievedDays}
            totalDays={progress.totalDays}
            streak={progress.streak}
          />
          <MyPageStatsBlock
            completedHabits={completedHabits}
            points={myStats.points}
            rank={myStats.rank}
            onOpenShop={() => setShowPointShop(true)}
          />
          <section>
            <AttendanceStrip
              startedAt={progress.startedAt}
              totalDays={progress.totalDays}
              verifiedDays={progress.verifiedDays}
              livesLeft={livesLeft}
              onLivesClick={openSosModal}
            />
            <button
              type="button"
              onClick={() => setShowQuit(true)}
              className="block w-full pt-4 text-center text-xs text-slate-500 hover:text-slate-400"
            >
              챌린지 포기하기
            </button>
          </section>
        </>
      ) : selected && recruiting ? (
        <>
          <Card className="p-5 text-center">
            <p className="text-sm leading-relaxed text-zinc-300">
              ⏳ 아직 레이스가 시작되지 않았습니다. (멤버 대기 중)
            </p>
            <button
              type="button"
              onClick={() => onOpenRoom(selected)}
              className="mt-4 w-full rounded-xl bg-[#00FF87] py-3 text-sm font-bold text-black transition-transform active:scale-[0.98]"
            >
              모임방 대기실 바로가기
            </button>
            <button
              type="button"
              onClick={() => setShowQuit(true)}
              className="mt-4 block w-full text-center text-xs text-slate-500 hover:text-slate-400"
            >
              챌린지 포기하기
            </button>
          </Card>
          <MyPageStatsBlock
            completedHabits={completedHabits}
            points={myStats.points}
            rank={myStats.rank}
            onOpenShop={() => setShowPointShop(true)}
          />
        </>
      ) : (
        <>
          <Card className="p-8 text-center">
            <p className="text-sm leading-relaxed text-gray-400">
              아직 참여 중인 모임이 없습니다. 새로운 모임을 찾아보세요!
            </p>
            <button
              type="button"
              onClick={onGoFind}
              className="mt-4 rounded-xl bg-[#00FF87] px-4 py-2.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
            >
              모임 둘러보기
            </button>
          </Card>
          <MyPageStatsBlock
            completedHabits={completedHabits}
            points={myStats.points}
            rank={myStats.rank}
            onOpenShop={() => setShowPointShop(true)}
          />
        </>
      )}

      <PointShopModal
        open={showPointShop}
        points={myStats.points}
        livesLeft={livesLeft}
        hasSlotExpansion={extraGroupSlots > 0}
        purchasing={purchasing}
        onClose={() => !purchasing && setShowPointShop(false)}
        onPurchaseHeart={() => void handlePurchaseHeart()}
        onPurchaseSlot={() => void handlePurchaseSlot()}
      />

      {/* 실시간 랭킹 TOP 5 */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-gray-300">
          <Trophy size={16} className="text-[#00FF87]" /> 실시간 랭킹 TOP 5
        </h2>
        <Card className="divide-y divide-gray-800 p-1">
          {liveRanking.topFive.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm leading-relaxed text-zinc-400">
              첫 챌린지를 달성하고 첫 번째 랭커가 되어보세요! 🔥
            </p>
          ) : (
            liveRanking.topFive.map((u) => (
              <div
                key={u.userId}
                className={`flex items-center gap-3 rounded-xl p-3 ${
                  u.me ? "bg-[#00FF87]/10" : ""
                }`}
              >
                <span className="w-6 text-center text-sm font-bold">
                  {u.rank <= 3 ? (
                    <Crown
                      size={18}
                      className={
                        u.rank === 1
                          ? "mx-auto text-yellow-400"
                          : u.rank === 2
                          ? "mx-auto text-gray-300"
                          : "mx-auto text-amber-600"
                      }
                    />
                  ) : (
                    <span className="text-gray-500">{u.rank}</span>
                  )}
                </span>
                <Avatar
                  name={u.name}
                  color={u.color}
                  src={u.me ? myProfileImage ?? undefined : u.avatarUrl || undefined}
                  size={36}
                />
                <span
                  className={`flex-1 text-sm font-semibold ${
                    u.me ? "text-[#00FF87]" : "text-white"
                  }`}
                >
                  {u.name}
                  {u.me ? <span className="ml-1 text-[11px] text-gray-400">· 나</span> : null}
                </span>
                <span className="text-sm font-bold text-gray-300">
                  {u.points.toLocaleString()}
                  <span className="ml-0.5 text-[11px] font-normal text-gray-500">P</span>
                </span>
              </div>
            ))
          )}
        </Card>
      </section>

      <FooterLinkCards />

      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={loggingOut || withdrawing}
        className="flex w-full items-center justify-center gap-1.5 py-4 text-center text-sm text-zinc-500 underline underline-offset-4 transition-colors hover:text-zinc-300 disabled:opacity-50"
      >
        <LogOut size={14} strokeWidth={2} />
        {loggingOut ? "로그아웃 중..." : "로그아웃"}
      </button>

      <button
        type="button"
        onClick={openWithdrawModal}
        disabled={loggingOut || withdrawing}
        className="flex w-full items-center justify-center gap-1.5 pb-4 text-center text-sm text-zinc-500 underline underline-offset-4 transition-colors hover:text-zinc-300 disabled:opacity-50"
      >
        회원탈퇴
      </button>

      <WithdrawRetentionModal
        open={showWithdrawModal}
        userPoints={userPoints}
        withdrawing={withdrawing}
        onClose={() => !withdrawing && setShowWithdrawModal(false)}
        onConfirmWithdraw={() => void confirmWithdrawAccount()}
      />

      <WeeklyShortsModal
        open={showShortsModal}
        onClose={() => setShowShortsModal(false)}
        groupId={selected?.id ?? ""}
        userId={myUserId ?? ""}
        week={
          SHORTS_FFMPEG_TEST_MODE
            ? SHORTS_TEST_WEEK
            : (shortsWindow?.week ?? 1)
        }
      />

      <NicknameLimitModal
        open={showNickLimit}
        daysLeft={nicknameLockDays}
        onClose={() => setShowNickLimit(false)}
      />

      <BottomSheet
        open={showBioEdit}
        onClose={() => !savingBio && setShowBioEdit(false)}
        title="한 줄 소개"
      >
        <label className="block">
          <span className="sr-only">한 줄 소개</span>
          <input
            type="text"
            value={editBio}
            maxLength={BIO_MAX_LENGTH}
            autoComplete="off"
            autoFocus
            placeholder="나를 소개하는 한 줄을 남겨보세요"
            onChange={(event) => {
              setEditBio(event.target.value.slice(0, BIO_MAX_LENGTH));
              setBioError(null);
            }}
            className="w-full rounded-2xl border border-gray-700 bg-[#121316] px-4 py-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#00FF87]"
          />
        </label>
        <p className="mt-2 text-right text-[11px] text-gray-500">
          {editBio.length}/{BIO_MAX_LENGTH}
        </p>
        {bioError ? <p className="mt-1 text-[12px] text-red-400">{bioError}</p> : null}
        <button
          type="button"
          onClick={() => void saveBioEdit()}
          disabled={savingBio}
          className="mt-4 w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black disabled:opacity-60"
        >
          {savingBio ? "저장 중..." : "저장하기"}
        </button>
      </BottomSheet>

      <BottomSheet
        open={showNickEdit}
        onClose={() => !savingNickname && setShowNickEdit(false)}
        title="닉네임 수정"
      >
        <label className="block">
          <span className="sr-only">새 닉네임</span>
          <input
            type="text"
            value={editNickname}
            maxLength={10}
            autoComplete="off"
            autoFocus
            placeholder="2~10자 닉네임"
            onChange={(event) => {
              setEditNickname(event.target.value);
              setEditError(null);
            }}
            className="w-full rounded-2xl border border-gray-700 bg-[#121316] px-4 py-3.5 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#00FF87]"
          />
        </label>
        <p className="mt-2 text-[12px] text-gray-500">
          한글, 영문, 숫자, 밑줄(_)만 사용할 수 있습니다.
        </p>
        {editError && <p className="mt-1.5 text-[12px] text-red-400">{editError}</p>}
        <button
          type="button"
          onClick={() => void saveNicknameEdit()}
          disabled={savingNickname}
          className="mt-4 w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black active:scale-[0.98] disabled:opacity-60"
        >
          {savingNickname ? "저장 중..." : "변경하기"}
        </button>
        <p className="mt-3 text-center text-[11px] text-gray-500">
          14일 이내 남은 변경 횟수:{" "}
          <span className="font-semibold text-[#00FF87]">{remainingNicknameChanges}회</span>
        </p>
      </BottomSheet>

      <QuitChallengeModal
        open={showQuit}
        quitting={quitting}
        onClose={() => !quitting && setShowQuit(false)}
        onConfirm={() => void handleQuit()}
      />

      <SosHeartRechargeModal
        open={showSosModal}
        onClose={() => setShowSosModal(false)}
        groupId={selected?.id ?? ""}
        groupName={selected?.name ?? "모임"}
        userId={myUserId ?? ""}
        heartState={sosModalHeartState}
        onRecharged={(next) => {
          setHeartState(next);
          setShowSosModal(false);
        }}
        onToast={onPointsToast}
        onGraceExpired={() => {
          void onRunGraceExpulsionChecksRef.current?.();
          setHeartState(null);
        }}
      />
    </PullToRefresh>
  );
}
