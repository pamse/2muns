// 2müns — 앱 셸: 탭 전환 / 모달 / 룸 진입 등 전체 상태를 관리하는 루트 클라이언트 컴포넌트
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Plus, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Notice } from "@/lib/database.types";
import { addGroupMember, fetchAppGroups, removeGroupMember } from "@/lib/groups";
import {
  getGroupOwnerId,
  isGroupMember,
  isGroupOwner,
  isMyGroup,
  ME_AVATAR,
  type Group,
  type GroupFilter,
  type TabKey,
} from "./data";
import { BottomNav } from "./BottomNav";
import { CreateGroupSheet } from "./CreateGroupSheet";
import { FindTab, EntryDeniedModal } from "./FindTab";
import { InfoTab } from "./InfoTab";
import { LoginGateModal } from "./LoginGateModal";
import { MyTab } from "./MyTab";
import { NoticesSheet, useActiveNotices } from "./NoticesSheet";
import { MunsyWelcomeModal, hasSeenMunsyWelcome, isMunsyWelcomePending, markMunsyWelcomePending, markMunsyWelcomeSeen } from "./MunsyWelcomeModal";
import { Onboarding } from "./Onboarding";
import { RoomDetail } from "./RoomDetail";
import { useMyProfileImage } from "./useMyProfileImage";
import { useNickname } from "./useNickname";
import { Avatar, Logo } from "./ui";

const TAB_TITLE: Record<TabKey, string> = {
  info: "인사이트",
  find: "", // 모임찾기는 로고 헤더 사용
  my: "마이페이지",
};

type AuthIntent =
  | { type: "my" }
  | { type: "create" }
  | { type: "room"; groupId: string }
  | { type: "verify"; groupId: string };

async function notifyOwnerOfJoin({
  roomTitle,
  creatorId,
  joinUserId,
  joinNickname,
  memberCount,
  capacity,
  currentUserId,
  onNotice,
  onRefresh,
}: {
  roomTitle: string;
  creatorId: string;
  joinUserId: string;
  joinNickname: string;
  memberCount: number;
  capacity: number;
  currentUserId?: string | null;
  onNotice: (notice: Notice) => void;
  onRefresh: () => void;
}) {
  if (joinUserId === creatorId) {
    return;
  }

  const now = new Date().toISOString();
  const title = `[${roomTitle}] 새 멤버 참여!`;
  const content =
    `'${joinNickname}'님이 모임에 참여했습니다. (현재 ${memberCount}/${capacity}명)` +
    (memberCount >= 2 ? "\n이제 레이스를 시작할 수 있어요!" : "");

  const localNotice: Notice = {
    id: crypto.randomUUID(),
    title,
    content,
    tag: "참여",
    is_active: true,
    user_id: creatorId,
    created_at: now,
  };

  const ownerIsCurrentUser = Boolean(
    currentUserId && currentUserId === creatorId,
  );
  if (ownerIsCurrentUser) {
    onNotice(localNotice);
  }

  try {
    const { error } = await supabase.from("notices").insert({
      user_id: creatorId,
      title,
      content,
      tag: "참여",
      is_active: true,
      created_at: now,
    });
    if (error) {
      console.error(
        "notices insert failed",
        JSON.stringify(error, null, 2),
        error.message,
      );
      return;
    }
    if (ownerIsCurrentUser) {
      onRefresh();
    }
  } catch (error) {
    console.error("notices insert failed", error);
  }
}

export default function MunsApp() {
  const [tab, setTab] = useState<TabKey>("find");
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GroupFilter>("joinable");

  // 오버레이/모달 상태
  const [room, setRoom] = useState<Group | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showNotices, setShowNotices] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showMunsyWelcome, setShowMunsyWelcome] = useState(false);
  const [welcomeNickname, setWelcomeNickname] = useState("");
  const [showLoginGate, setShowLoginGate] = useState(false);
  const [showEntryDenied, setShowEntryDenied] = useState(false);
  const [autoOpenVerify, setAutoOpenVerify] = useState(false);
  const pendingIntentRef = useRef<AuthIntent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { src: myProfileImage, applyFile: applyProfileImage, clearImage } = useMyProfileImage();
  const {
    nickname,
    userId,
    ready,
    hasNickname,
    remaining,
    lockDays,
    saveInitialNickname,
    changeNickname,
    clearSession,
  } = useNickname();
  const { notices, loading: noticesLoading, error: noticesError, refresh: refreshNotices, prependNotice } = useActiveNotices(userId, ready);

  const refreshGroups = useCallback(async () => {
    try {
      const next = await fetchAppGroups();
      setGroups(next);
      setGroupsError(null);
      setRoom((current) => {
        if (!current) return current;
        return next.find((item) => item.id === current.id) ?? current;
      });
      return next;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "모임 목록을 불러오지 못했습니다.";
      setGroupsError(message);
      return null;
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshGroups();
  }, [refreshGroups]);

  useEffect(() => {
    if (!ready || !hasNickname) return;
    if (hasSeenMunsyWelcome()) return;
    if (isMunsyWelcomePending()) {
      setShowMunsyWelcome(true);
    }
  }, [ready, hasNickname]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function isLoggedIn() {
    return ready && hasNickname;
  }

  function requireAuth(intent: AuthIntent) {
    if (isLoggedIn()) return true;
    if (!ready) return false;
    pendingIntentRef.current = intent;
    setShowLoginGate(true);
    return false;
  }

  function clearPendingIntent() {
    pendingIntentRef.current = null;
    setAutoOpenVerify(false);
  }

  function handleTabChange(next: TabKey) {
    if (next === "my" && !requireAuth({ type: "my" })) return;
    setTab(next);
  }

  async function handleLogout() {
    clearImage();
    await clearSession();
    setRoom(null);
    setShowCreate(false);
    setShowNotices(false);
    setShowOnboarding(false);
    setShowLoginGate(false);
    setTab("find");
    window.location.href = "/";
  }

  function handleCreate(g: Group) {
    setGroups((prev) => [g, ...prev.filter((item) => item.id !== g.id)]);
    setFilter("mine");
    void refreshGroups();
  }

  async function openRoom(g: Group) {
    const member = isGroupMember(g, { userId, nickname });
    if (g.filter === "ongoing" && !member) {
      setShowEntryDenied(true);
      setAutoOpenVerify(false);
      return;
    }
    const alreadyMine = isMyGroup(g, userId) || member;
    if (g.filter === "joinable" && !alreadyMine && g.members.length < g.capacity) {
      const joinUserId = userId || "me";
      const joinNickname = nickname || "나";
      const joined: Group = {
        ...g,
        members: [
          ...g.members,
          {
            id: joinUserId,
            name: joinNickname,
            color: "linear-gradient(135deg,#00FF87,#0ea5e9)",
            avatar: myProfileImage || ME_AVATAR,
          },
        ],
      };

      if (userId) {
        try {
          await addGroupMember(g.id, userId, joined.members.length);
        } catch (error) {
          console.error("group join failed", error);
        }
      }

      const refreshed = await refreshGroups();
      const fromDb = refreshed?.find((item) => item.id === g.id);
      setRoom(fromDb ?? joined);

      const creatorId = getGroupOwnerId(g);
      if (creatorId && joinUserId !== creatorId && !isGroupOwner(g, userId)) {
        void notifyOwnerOfJoin({
          roomTitle: g.name,
          creatorId,
          joinUserId,
          joinNickname,
          memberCount: (fromDb ?? joined).members.length,
          capacity: g.capacity,
          currentUserId: userId,
          onNotice: prependNotice,
          onRefresh: () => {
            void refreshNotices(true);
          },
        });
      }
      return;
    }
    setRoom(g);
  }

  function handleOpenRoom(g: Group) {
    if (!requireAuth({ type: "room", groupId: g.id })) return;
    void openRoom(g);
  }

  useEffect(() => {
    if (!ready || !hasNickname) return;
    const intent = pendingIntentRef.current;
    if (!intent) return;

    if (intent.type === "my") {
      pendingIntentRef.current = null;
      setTab("my");
      return;
    }
    if (intent.type === "create") {
      pendingIntentRef.current = null;
      setShowCreate(true);
      return;
    }

    if (groupsLoading) return;
    const target = groups.find((item) => item.id === intent.groupId);
    if (!target) {
      pendingIntentRef.current = null;
      return;
    }
    pendingIntentRef.current = null;
    if (intent.type === "verify") {
      setAutoOpenVerify(true);
    }
    void openRoom(target);
  }, [ready, hasNickname, nickname, userId, groups, groupsLoading]);

  return (
    <div className="mx-auto h-dvh w-full max-w-[420px] bg-[#121316] text-white">
      {/* 실제 모바일 느낌을 위해 relative 컨테이너로 오버레이를 가둡니다. */}
      <div className="relative flex h-full min-h-0 flex-col overflow-hidden" id="muns-frame">
        {/* 상단 헤더 (모임 상세 룸에서는 자체 헤더 사용) */}
        <header className="relative z-20 flex shrink-0 items-center justify-between border-b border-gray-800 bg-[#121316]/95 px-4 py-3 backdrop-blur">
          {tab === "find" ? (
            <Logo />
          ) : (
            <h1 className="text-lg font-bold text-white">{TAB_TITLE[tab]}</h1>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="알림"
              onClick={() => {
                setShowNotices(true);
                void refreshNotices(true);
              }}
              className="relative p-2"
            >
              <Bell size={20} className="text-gray-400" />
              {notices.length > 0 ? (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#00FF87]" />
              ) : null}
            </button>
            {/* 프로필 아바타 → 마이페이지 */}
            <button
              type="button"
              onClick={() => handleTabChange("my")}
              aria-label="마이페이지"
              aria-current={tab === "my" ? "page" : undefined}
              className="ml-1"
            >
              {isLoggedIn() && myProfileImage ? (
                <Avatar
                  name={nickname || "나"}
                  color="linear-gradient(135deg,#00FF87,#0ea5e9)"
                  src={myProfileImage}
                  size={34}
                  ring
                />
              ) : (
                <span
                  className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-zinc-800 ring-2 ring-[#1B1D22]"
                  aria-hidden
                >
                  <User className="h-5 w-5 text-zinc-400" />
                </span>
              )}
            </button>
          </div>
        </header>

        {/* 탭 콘텐츠 */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          {tab === "info" && <InfoTab />}
          {tab === "find" && (
            <FindTab
              groups={groups}
              filter={filter}
              onFilterChange={setFilter}
              onOpenRoom={handleOpenRoom}
              myUserId={userId}
              nickname={nickname}
              loading={groupsLoading}
              error={groupsError}
            />
          )}
          {tab === "my" && (
            <MyTab
              nickname={nickname}
              remainingNicknameChanges={remaining}
              nicknameLockDays={lockDays}
              onChangeNickname={changeNickname}
              myProfileImage={myProfileImage}
              onSelectProfileImage={applyProfileImage}
              groups={groups}
              myUserId={userId}
              onOpenRoom={handleOpenRoom}
              onLogout={() => void handleLogout()}
              onQuitGroup={(groupId) => {
                const joinUserId = userId || "me";
                const target = groups.find((item) => item.id === groupId);
                const remainingCount = target
                  ? target.members.filter(
                      (member) => member.id !== joinUserId && member.id !== "me",
                    ).length
                  : 0;
                setGroups((prev) =>
                  prev.map((item) =>
                    item.id === groupId
                      ? {
                          ...item,
                          members: item.members.filter(
                            (member) => member.id !== joinUserId && member.id !== "me",
                          ),
                        }
                      : item,
                  ),
                );
                if (userId) {
                  void removeGroupMember(groupId, userId, remainingCount).then(() => {
                    void refreshGroups();
                  });
                }
              }}
              onGoFind={() => {
                setFilter("joinable");
                setTab("find");
              }}
            />
          )}
        </main>

        {/* 하단 탭바 */}
        <BottomNav active={tab} onChange={handleTabChange} />

        {/* 새 모임 개설 FAB — 모바일 프레임 기준 탭바 바로 위 고정 */}
        {tab === "find" && (
          <button
            onClick={() => {
              if (!requireAuth({ type: "create" })) return;
              setShowCreate(true);
            }}
            aria-label="새 모임 개설"
            className="absolute bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#00FF87] text-black shadow-[0_8px_24px_#00FF8766] transition-transform active:scale-90"
          >
            <Plus size={28} strokeWidth={2.6} />
          </button>
        )}

        {/* 오버레이들 */}
        {room && (
          <RoomDetail
            group={room}
            onBack={() => {
              setRoom(null);
              setAutoOpenVerify(false);
            }}
            nickname={nickname}
            myAvatar={myProfileImage}
            userId={userId}
            requireAuth={() =>
              requireAuth({ type: "verify", groupId: room.id })
            }
            autoOpenVerify={autoOpenVerify}
            onAutoOpenVerifyHandled={() => setAutoOpenVerify(false)}
            onGroupUpdate={(updated) => {
              setRoom(updated);
              setGroups((prev) =>
                prev.map((item) => (item.id === updated.id ? updated : item)),
              );
            }}
            onRaceNotices={prependNotice}
            onNoticesRefresh={() => {
              void refreshNotices(true);
            }}
            onLeaveGroup={() => {
              setRoom(null);
              setToast("모임 참여를 취소했습니다");
              void refreshGroups();
            }}
            onDeleteGroup={(groupId) => {
              setGroups((prev) => prev.filter((item) => item.id !== groupId));
              setRoom(null);
              setToast("모임을 삭제했습니다");
              void refreshGroups();
            }}
          />
        )}

        <EntryDeniedModal
          open={showEntryDenied}
          onClose={() => setShowEntryDenied(false)}
        />

        <NoticesSheet
          open={showNotices}
          onClose={() => setShowNotices(false)}
          notices={notices}
          loading={noticesLoading}
          error={noticesError}
        />

        <CreateGroupSheet
          open={showCreate}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
          onCreatedNotice={prependNotice}
          onNoticesRefresh={() => {
            void refreshNotices(true);
          }}
          ownerId={userId || "me"}
          ownerName={nickname || "나"}
          ownerAvatar={myProfileImage || ME_AVATAR}
        />

        <LoginGateModal
          open={showLoginGate}
          onClose={() => {
            setShowLoginGate(false);
            clearPendingIntent();
          }}
          onLogin={() => {
            setShowLoginGate(false);
            setShowOnboarding(true);
          }}
        />

        <Onboarding
          open={showOnboarding}
          required={false}
          onClose={() => {
            setShowOnboarding(false);
            clearPendingIntent();
          }}
          onComplete={async ({ nickname: nextNickname, selectedCategories }) => {
            const wasNew = !hasNickname;
            if (wasNew) {
              await saveInitialNickname(nextNickname, selectedCategories);
            }
            setShowOnboarding(false);
            if (wasNew && !hasSeenMunsyWelcome()) {
              markMunsyWelcomePending();
              setWelcomeNickname(nextNickname.trim());
              setShowMunsyWelcome(true);
            }
          }}
        />

        <MunsyWelcomeModal
          open={showMunsyWelcome}
          nickname={welcomeNickname || nickname}
          onStart={() => {
            markMunsyWelcomeSeen();
            setShowMunsyWelcome(false);
            setFilter("joinable");
            setTab("find");
          }}
        />

        {toast ? (
          <div
            role="status"
            className="pointer-events-none absolute bottom-24 left-1/2 z-[80] w-[min(calc(100%-2rem),320px)] -translate-x-1/2 rounded-xl border border-white/10 bg-[#1B1D22] px-4 py-2.5 text-center text-[13px] font-medium text-white shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
          >
            {toast}
          </div>
        ) : null}
      </div>
    </div>
  );
}
