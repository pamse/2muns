"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, MoreVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar } from "./ui";
import {
  BlockConfirmModal,
  ReportUserModal,
  UserActionSheet,
} from "./UserModerationUi";
import {
  blockUser,
  fetchPublicUserProfile,
  fetchPublicVerificationsForUser,
  submitUserReport,
  type PublicUserProfile,
  type PublicVerificationCard,
  type ReportReason,
} from "@/lib/moderation";
import { verificationVideoUrl } from "@/lib/verifications";
import { videoSourceTypeForUrl } from "@/lib/videoFormat";
import { cacheBustAvatarUrl } from "@/lib/profile";
import { normalizeGroupId } from "./data";

export function PublicProfileView({
  userId,
  viewerUserId,
  onBlocked,
  onToast,
  embedded = false,
  onBack,
}: {
  userId: string;
  viewerUserId?: string | null;
  onBlocked?: (blockedId: string) => void;
  onToast?: (message: string) => void;
  embedded?: boolean;
  onBack?: () => void;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicUserProfile | null>(null);
  const [cards, setCards] = useState<PublicVerificationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSelf = Boolean(
    viewerUserId && normalizeGroupId(viewerUserId) === normalizeGroupId(userId),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, v] = await Promise.all([
        fetchPublicUserProfile(userId),
        fetchPublicVerificationsForUser(userId),
      ]);
      setProfile(p);
      setCards(v);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleBack() {
    if (onBack) {
      onBack();
      return;
    }
    router.back();
  }

  async function confirmBlock() {
    if (!viewerUserId || !profile) return;
    setBusy(true);
    try {
      await blockUser(viewerUserId, profile.id);
      onBlocked?.(profile.id);
      onToast?.("사용자를 차단했습니다.");
      setBlockOpen(false);
      handleBack();
    } finally {
      setBusy(false);
    }
  }

  async function submitReport(reason: ReportReason, detail?: string) {
    if (!profile) return;
    setBusy(true);
    try {
      const text = reason === "기타" && detail ? `${reason}: ${detail}` : reason;
      const ok = await submitUserReport({
        reporterId: viewerUserId ?? null,
        reportedUserId: profile.id,
        reason: text,
      });
      setReportOpen(false);
      onToast?.(
        ok
          ? "신고가 접수되었습니다. 24시간 내 검토됩니다."
          : "신고 접수에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  const shellClass = embedded
    ? "absolute inset-0 z-[88] flex flex-col bg-[#121316]"
    : "mx-auto flex min-h-dvh w-full max-w-[420px] flex-col bg-[#121316] text-white";

  return (
    <div className={shellClass}>
      <header className="flex shrink-0 items-center gap-2 border-b border-gray-800 px-3 py-3">
        <button type="button" onClick={handleBack} aria-label="뒤로" className="p-1">
          <ArrowLeft size={22} />
        </button>
        <h1 className="flex-1 text-base font-bold">프로필</h1>
        {!isSelf && profile && viewerUserId ? (
          <button
            type="button"
            aria-label="차단 및 신고"
            onClick={() => setMenuOpen(true)}
            className="rounded-full p-2 text-zinc-400 hover:bg-white/5"
          >
            <MoreVertical size={20} />
          </button>
        ) : null}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
            <Loader2 size={16} className="animate-spin" />
            불러오는 중
          </p>
        ) : !profile ? (
          <p className="py-16 text-center text-sm text-zinc-500">프로필을 찾을 수 없습니다.</p>
        ) : (
          <>
            <div className="flex flex-col items-center text-center">
              <Avatar
                name={profile.nickname}
                color="linear-gradient(135deg,#00FF87,#0ea5e9)"
                src={
                  profile.avatarUrl
                    ? cacheBustAvatarUrl(profile.avatarUrl, profile.id)
                    : undefined
                }
                size={72}
                ring
              />
              <h2 className="mt-3 text-lg font-bold">{profile.nickname}</h2>
              <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-zinc-400">
                {profile.bio || "한 줄 소개가 없습니다."}
              </p>
            </div>

            <section className="mt-8">
              <h3 className="mb-2 text-sm font-bold text-zinc-300">공개 인증 기록</h3>
              {cards.length === 0 ? (
                <p className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center text-[13px] text-zinc-500">
                  표시할 인증이 없습니다.
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-3">
                  {cards.map((card) => (
                    <li
                      key={card.id}
                      className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/80"
                    >
                      <div className="relative aspect-[3/4] bg-black">
                        <video
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          loop
                          autoPlay
                        >
                          <source
                            src={verificationVideoUrl(card.videoPath)}
                            type={videoSourceTypeForUrl(card.videoPath)}
                          />
                        </video>
                      </div>
                      <div className="px-2.5 py-2">
                        <p className="truncate text-[12px] font-semibold text-white">
                          {card.groupName}
                        </p>
                        <p className="text-[11px] text-zinc-500">{card.day}일차</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      {profile && !isSelf ? (
        <>
          <UserActionSheet
            open={menuOpen}
            nickname={profile.nickname}
            onClose={() => setMenuOpen(false)}
            onViewProfile={() => setMenuOpen(false)}
            onBlock={() => setBlockOpen(true)}
            onReport={() => setReportOpen(true)}
          />
          <BlockConfirmModal
            open={blockOpen}
            onClose={() => !busy && setBlockOpen(false)}
            onConfirm={() => void confirmBlock()}
            busy={busy}
          />
          <ReportUserModal
            open={reportOpen}
            nickname={profile.nickname}
            onClose={() => !busy && setReportOpen(false)}
            onSubmit={(reason, detail) => void submitReport(reason, detail)}
            busy={busy}
          />
        </>
      ) : null}
    </div>
  );
}
