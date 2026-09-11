// 2müns — 'MY' 탭: 참여 모임 관리 / 실천율 / 출석 현황 / 포인트 & 랭킹
"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Camera,
  Clock,
  Crown,
  LogOut,
  Pencil,
  ShieldCheck,
  Star,
  Trophy,
  X,
} from "lucide-react";
import { validateNickname } from "./useNickname";
import {
  MAX_JOINED_GROUPS,
  RANKING,
  hasRaceStarted,
  isGroupMember,
  type Group,
} from "./data";
import { AttendanceStrip, ATTENDANCE_LIVES } from "./AttendanceStrip";
import { MunsyProgressCard } from "./MunsyProgressCard";
import { Avatar, BottomSheet, Card, Pill } from "./ui";
import { WeeklyShortsModal } from "./WeeklyShortsModal";

/** 목업 유예 시간 — 23:48:12 */
const INITIAL_PURGE_SECONDS = 23 * 3600 + 48 * 60 + 12;

function formatHms(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

function usePurgeCountdown(initialSeconds: number) {
  const [left, setLeft] = useState(initialSeconds);
  const deadlineRef = useRef<number | null>(null);

  useEffect(() => {
    deadlineRef.current = Date.now() + initialSeconds * 1000;
    const id = window.setInterval(() => {
      if (!deadlineRef.current) return;
      setLeft(Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [initialSeconds]);

  return left;
}

const PROFILE = {
  color: "linear-gradient(135deg,#00FF87,#0ea5e9)",
  points: 1980,
  rank: 4,
};

function ProfilePhotoButton({
  src,
  name,
  onSelectFile,
}: {
  src: string | null;
  name: string;
  onSelectFile: (file: File) => void;
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
      className="group relative shrink-0"
    >
      <span className="relative block">
        <Avatar name={name} color={PROFILE.color} src={src ?? undefined} size={56} />
        <span className="pointer-events-none absolute inset-0 rounded-full bg-black/0 transition-colors group-hover:bg-black/45" />
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

function WarningBadge({ miss }: { miss: number }) {
  if (miss >= 3)
    return (
      <Pill tone="danger">
        <AlertTriangle size={12} /> 강제 퇴장 대상
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

function groupProgress(group: Group) {
  const achievedDays = Math.max(0, group.day);
  const totalDays = group.total;
  const pastSlots = 13;
  const filled = Math.min(pastSlots, achievedDays);
  const attendance = Array.from({ length: 14 }, (_, index) => {
    if (index === 13) return false;
    if (index === 4) return false;
    return index >= pastSlots - filled;
  });
  const missCount = attendance.slice(0, 13).filter((done) => !done).length;
  return {
    achievedDays,
    totalDays,
    missCount,
    streak: achievedDays,
    attendance,
  };
}

export function MyTab({
  onGoFind,
  onOpenRoom,
  onQuitGroup,
  onLogout,
  groups,
  myUserId,
  nickname,
  remainingNicknameChanges,
  nicknameLockDays,
  onChangeNickname,
  myProfileImage,
  onSelectProfileImage,
}: {
  onGoFind: () => void;
  onOpenRoom: (group: Group) => void;
  onQuitGroup: (groupId: string) => void;
  onLogout: () => void;
  groups: Group[];
  myUserId?: string | null;
  nickname: string;
  remainingNicknameChanges: number;
  nicknameLockDays: number;
  onChangeNickname: (next: string) => Promise<void>;
  myProfileImage: string | null;
  onSelectProfileImage: (file: File) => void;
}) {
  const myGroups = useMemo(
    () => groups.filter((group) => isGroupMember(group, { userId: myUserId, nickname })),
    [groups, myUserId, nickname],
  );
  const [selectedId, setSelectedId] = useState(myGroups[0]?.id ?? "");
  const [showQuit, setShowQuit] = useState(false);
  const [showShortsBanner, setShowShortsBanner] = useState(true);
  const [showShortsModal, setShowShortsModal] = useState(false);
  const [showNickEdit, setShowNickEdit] = useState(false);
  const [showNickLimit, setShowNickLimit] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingNickname, setSavingNickname] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const purgeLeft = usePurgeCountdown(INITIAL_PURGE_SECONDS);
  const expired = purgeLeft <= 0;

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
  const progress = selected && started ? groupProgress(selected) : null;
  const canAdd = myGroups.length < MAX_JOINED_GROUPS;

  function handleQuit() {
    if (!selected) return;
    onQuitGroup(selected.id);
    setShowQuit(false);
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
    if (loggingOut) return;
    const confirmed = window.confirm("로그아웃 하시겠습니까?");
    if (!confirmed) return;
    setLoggingOut(true);
    onLogout();
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
    <div className="space-y-5 px-4 pb-28 pt-4">
      {/* 프로필 헤더 */}
      <div className="flex items-center gap-3">
        <ProfilePhotoButton
          src={myProfileImage}
          name={nickname || "나"}
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
            {selected && started ? <WarningBadge miss={progress?.missCount ?? 0} /> : null}
          </div>
          <p className="text-[13px] text-gray-400">
            {selected
              ? recruiting
                ? `${selected.name} · 멤버 대기 중`
                : `${selected.name} 참여 중`
              : "참여 중인 챌린지가 없어요"}
          </p>
        </div>
      </div>

      {/* 참여 중인 챌린지 칩 */}
      <section>
        <p className="mb-2 px-1 text-sm font-bold text-gray-300">
          참여 중인 챌린지 ({myGroups.length}/{MAX_JOINED_GROUPS}개)
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

      {selected && started && showShortsBanner && (
        <div className="relative overflow-hidden rounded-2xl border border-[#00FF87]/40 bg-gradient-to-r from-[#1B1D22] to-[#121316] p-4">
          <button
            type="button"
            onClick={() => setShowShortsBanner(false)}
            aria-label="배너 닫기"
            className="absolute right-3 top-3 rounded-full p-1 text-gray-500 transition-colors hover:bg-white/5 hover:text-gray-300"
          >
            <X size={16} />
          </button>
          <span className="inline-flex rounded-full bg-[#00FF87]/15 px-2.5 py-0.5 text-xs font-semibold text-[#00FF87]">
            🔥 1주 차 숏츠 생성 완료
          </span>
          <p
            className={`mt-2 font-mono text-[13px] font-semibold tabular-nums ${
              expired ? "text-red-400" : "text-amber-300"
            }`}
          >
            {expired
              ? "⏳ 유예 기간이 종료되어 영상이 파기되었습니다"
              : `⏳ 파기까지 ${formatHms(purgeLeft)} 남음`}
          </p>
          <p className="mt-1.5 pr-6 text-[12px] leading-relaxed text-gray-400">
            이번 주 7일의 노력이 담긴 숏폼 클립이 완성되었어요. 24시간 후 서버에서
            영구 삭제됩니다.
          </p>
          <button
            type="button"
            onClick={() => setShowShortsModal(true)}
            disabled={expired}
            className="mt-3 rounded-xl bg-[#00FF87] px-4 py-2 text-sm font-bold text-black transition-[filter] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            지금 영상 다운로드
          </button>
        </div>
      )}

      {selected && started && progress ? (
        <>
          <MunsyProgressCard
            currentDays={progress.achievedDays}
            totalDays={progress.totalDays}
            streak={progress.streak}
          />

          {/* 포인트 & 랭킹 요약 */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="flex flex-col gap-1 p-4">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Star size={15} className="text-[#00FF87]" />
                <span className="text-xs">획득 포인트</span>
              </div>
              <p className="text-2xl font-extrabold text-white">
                {PROFILE.points.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-gray-500">P</span>
              </p>
            </Card>
            <Card className="flex flex-col gap-1 p-4">
              <div className="flex items-center gap-1.5 text-gray-400">
                <Trophy size={15} className="text-[#00FF87]" />
                <span className="text-xs">실시간 랭킹</span>
              </div>
              <p className="text-2xl font-extrabold text-white">
                {PROFILE.rank}
                <span className="ml-0.5 text-sm font-medium text-gray-500">위</span>
              </p>
            </Card>
          </div>

          <section>
            <AttendanceStrip
              doneFlags={progress.attendance}
              livesLeft={ATTENDANCE_LIVES - progress.missCount}
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
        </Card>
      ) : (
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
      )}

      {/* 실시간 유저 랭킹 (1~10위) */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 px-1 text-sm font-bold text-gray-300">
          <Trophy size={16} className="text-[#00FF87]" /> 실시간 유저 랭킹 TOP 10
        </h2>
        <Card className="divide-y divide-gray-800 p-1">
          {RANKING.map((u) => (
            <div
              key={u.rank}
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
                name={u.me ? nickname || u.name : u.name}
                color={u.color}
                src={u.me ? myProfileImage ?? undefined : u.avatarUrl}
                size={36}
              />
              <span
                className={`flex-1 text-sm font-semibold ${
                  u.me ? "text-[#00FF87]" : "text-white"
                }`}
              >
                {u.me ? nickname || u.name : u.name}
                {u.me && <span className="ml-1 text-[11px] text-gray-400">· 나</span>}
              </span>
              <span className="text-sm font-bold text-gray-300">
                {u.points.toLocaleString()}
                <span className="ml-0.5 text-[11px] font-normal text-gray-500">P</span>
              </span>
            </div>
          ))}
        </Card>
      </section>

      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={loggingOut}
        className="flex w-full items-center justify-center gap-1.5 py-4 text-center text-sm text-zinc-500 underline underline-offset-4 transition-colors hover:text-zinc-300 disabled:opacity-50"
      >
        <LogOut size={14} strokeWidth={2} />
        {loggingOut ? "로그아웃 중..." : "로그아웃"}
      </button>

      <WeeklyShortsModal
        open={showShortsModal}
        onClose={() => setShowShortsModal(false)}
      />

      <NicknameLimitModal
        open={showNickLimit}
        daysLeft={nicknameLockDays}
        onClose={() => setShowNickLimit(false)}
      />

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

      <BottomSheet
        open={showQuit}
        onClose={() => setShowQuit(false)}
        title="정말 챌린지를 중단하시겠습니까?"
      >
        <p className="text-[13px] leading-relaxed text-gray-400">
          중도 퇴장 시 해당 모임의 66일 누적 기록과 달성 포인트가 소멸되며, 다시 입장할 수
          없습니다.
        </p>
        <div className="mt-5 space-y-2.5">
          <button
            onClick={() => setShowQuit(false)}
            className="w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black active:scale-[0.98]"
          >
            계속 도전하기
          </button>
          <button
            onClick={handleQuit}
            className="w-full rounded-xl bg-red-500/90 py-3.5 text-sm font-bold text-white active:scale-[0.98]"
          >
            포기하기
          </button>
        </div>
      </BottomSheet>
    </div>
  );
}
