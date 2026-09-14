// 2müns — 앱 셸: 탭 전환 / 모달 / 룸 진입 등 전체 상태를 관리하는 루트 클라이언트 컴포넌트
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Plus, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Notice } from "@/lib/database.types";
import { addGroupMember, applyUserProfileToGroups, clearPersistedJoinedIds, countUserMemberships, fetchAppGroups, hydrateUserGroups, overlayMyProfile, persistJoinedIds, quitChallengeGroup } from "@/lib/groups";
import { canGuestJoinGroup } from "@/lib/groupRecruiting";
import { getEffectiveMaxJoinedGroups, type PointAwardResult } from "@/lib/points";
import { withdrawUserAccount } from "@/lib/account";
import { ensurePublicUserFromAuth } from "@/lib/authUser";
import { parseCheerLink } from "@/lib/cheerNotifications";
import { PROFILE_UPDATED_EVENT } from "@/lib/profile";
import { useUserPoints } from "./useUserPoints";
import {
  getGroupOwnerId,
  isGroupMember,
  isGroupOwner,
  JOIN_LIMIT_MESSAGE,
  listJoinedActiveGroups,
  MAX_JOINED_GROUPS,
  normalizeGroupId,
  ME_AVATAR,
  type Group,
  type GroupFilter,
  type TabKey,
} from "./data";
import { BottomNav } from "./BottomNav";
import {
  CreateGroupSheet,
  groupToCreatePrefill,
  type CreateGroupPrefill,
} from "./CreateGroupSheet";
import { FindTab, EntryDeniedModal, JoinLimitModal } from "./FindTab";
import { InfoTab } from "./InfoTab";
import { LoginGateModal } from "./LoginGateModal";
import { MyTab } from "./MyTab";
import { NoticesSheet, useActiveNotices } from "./NoticesSheet";
import { MunsyWelcomeModal, hasSeenMunsyWelcome, isMunsyWelcomePending, markMunsyWelcomePending, markMunsyWelcomeSeen } from "./MunsyWelcomeModal";
import { HostPromotionModal, parseHostPromotionNotice, type HostPromotionPayload } from "./HostPromotionModal";
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
  | { type: "join"; groupId: string }
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
  const [joinedGroupIds, setJoinedGroupIds] = useState<string[]>([]);

  // 오버레이/모달 상태
  const [room, setRoom] = useState<Group | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createPrefill, setCreatePrefill] = useState<CreateGroupPrefill | null>(null);
  const [hostPromo, setHostPromo] = useState<HostPromotionPayload | null>(null);
  const [showNotices, setShowNotices] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showMunsyWelcome, setShowMunsyWelcome] = useState(false);
  const [welcomeNickname, setWelcomeNickname] = useState("");
  const [showLoginGate, setShowLoginGate] = useState(false);
  const [showEntryDenied, setShowEntryDenied] = useState(false);
  const [showJoinLimit, setShowJoinLimit] = useState(false);
  const [autoOpenVerify, setAutoOpenVerify] = useState(false);
  const pendingIntentRef = useRef<AuthIntent | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { src: myProfileImage, applyFile: applyProfileImage, clearImage, uploading: profileImageUploading } = useMyProfileImage();
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
    resetLocalSession,
    hydrateRegisteredProfile,
  } = useNickname();
  const { notices, loading: noticesLoading, error: noticesError, refresh: refreshNotices, prependNotice, removeNotice } = useActiveNotices(userId, ready);
  const {
    snapshot: pointsSnapshot,
    points: userPoints,
    extraGroupSlots,
    heartBonusByGroup,
    applySnapshot: applyPointsSnapshot,
    refresh: refreshPoints,
  } = useUserPoints(userId);

  const [groupsRefreshing, setGroupsRefreshing] = useState(false);
  const refreshInFlightRef = useRef<Promise<Group[] | null> | null>(null);
  const pendingRefreshRef = useRef(false);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionRef = useRef({
    userId: userId as string | null,
    nickname,
    avatar: myProfileImage,
    loggedIn: false,
  });
  const prevSessionKeyRef = useRef<string>("");
  sessionRef.current = {
    userId,
    nickname,
    avatar: myProfileImage,
    loggedIn: ready && hasNickname,
  };

  const refreshGroups = useCallback(async (options?: { showSpinner?: boolean }) => {
    if (options?.showSpinner) setGroupsRefreshing(true);
    if (refreshInFlightRef.current) {
      pendingRefreshRef.current = true;
      return refreshInFlightRef.current;
    }

    const run = (async () => {
      try {
        let next: Group[] | null = null;
        do {
          pendingRefreshRef.current = false;
          const session = sessionRef.current;
          if (session.loggedIn && session.userId && session.nickname.trim()) {
            const hydrated = await hydrateUserGroups(session.userId, {
              nickname: session.nickname,
              avatar: session.avatar,
            });
            next = hydrated.groups;
            setJoinedGroupIds(hydrated.joinedIds);
          } else {
            next = await fetchAppGroups();
            setJoinedGroupIds([]);
          }
          setGroups(next);
          setGroupsError(null);
          setRoom((current) => {
            if (!current) return current;
            return next?.find((item) => item.id === current.id) ?? current;
          });
        } while (pendingRefreshRef.current);
        return next;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "모임 목록을 불러오지 못했습니다.";
        setGroupsError(message);
        return null;
      } finally {
        refreshInFlightRef.current = null;
        setGroupsLoading(false);
        setGroupsRefreshing(false);
      }
    })();

    refreshInFlightRef.current = run;
    return run;
  }, []);

  const scheduleRefreshGroups = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshGroups();
    }, 250);
  }, [refreshGroups]);

  useEffect(() => {
    void refreshGroups();
  }, [refreshGroups, userId, nickname, ready, hasNickname]);

  useEffect(() => {
    if (!ready || (hasNickname && userId)) return;
    setJoinedGroupIds((prev) => (prev.length > 0 ? [] : prev));
  }, [userId, hasNickname, ready]);

  useEffect(() => {
    if (!ready || !hasNickname || !userId) return;
    if (joinedGroupIds.length === 0) return;
    persistJoinedIds(userId, joinedGroupIds);
  }, [userId, hasNickname, joinedGroupIds, ready]);

  useEffect(() => {
    if (!ready) return;
    const sessionKey = `${userId ?? ""}:${hasNickname ? nickname : ""}`;
    const prevKey = prevSessionKeyRef.current;
    prevSessionKeyRef.current = sessionKey;
    if (!prevKey || prevKey === sessionKey) return;

    setJoinedGroupIds([]);
    setGroups([]);
    setGroupsLoading(true);
    setRoom(null);
    setFilter((current) =>
      current === "mine" || current === "ongoing" ? "joinable" : current,
    );
    void refreshGroups();
  }, [ready, userId, nickname, hasNickname, refreshGroups]);

  const reconcileOnboarding = useCallback(
    async (options?: { openLoginWhenSignedOut?: boolean }) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        setShowOnboarding(Boolean(options?.openLoginWhenSignedOut));
        return;
      }

      if (hasNickname && userId === session.user.id) {
        setShowOnboarding(false);
        return;
      }

      if (await hydrateRegisteredProfile(session.user.id)) {
        setShowOnboarding(false);
        return;
      }

      setShowOnboarding(true);
    },
    [hasNickname, hydrateRegisteredProfile, userId],
  );

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void ensurePublicUserFromAuth(session.user);
        void reconcileOnboarding();
        return;
      }
      setShowOnboarding(false);
      setJoinedGroupIds([]);
      setRoom(null);
      setFilter((current) => (current === "mine" ? "joinable" : current));
      void refreshGroups();
    });
    return () => {
      subscription.unsubscribe();
    };
  }, [reconcileOnboarding, refreshGroups]);

  useEffect(() => {
    if (!ready) return;
    void reconcileOnboarding();
  }, [ready, reconcileOnboarding]);

  useEffect(() => {
    if (!ready || !userId || hostPromo) return;
    const promoNotice = notices.find(
      (notice) => notice.tag === "방장위임" && notice.user_id === userId,
    );
    if (!promoNotice) return;
    const parsed = parseHostPromotionNotice(promoNotice.content);
    if (!parsed) return;
    setHostPromo({
      noticeId: promoNotice.id,
      groupId: parsed.groupId,
      displayName: parsed.displayName,
    });
  }, [notices, userId, ready, hostPromo]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    if (params.get("onboarding") === "1") {
      void reconcileOnboarding();
      params.delete("onboarding");
    }

    if (params.get("error") === "auth-failed") {
      const reason = params.get("reason");
      setToast(
        reason
          ? `로그인에 실패했습니다. (${reason})`
          : "로그인에 실패했습니다. 다시 시도해 주세요.",
      );
      params.delete("error");
      params.delete("reason");
    }

    const nextQuery = params.toString();
    const nextUrl = nextQuery
      ? `${window.location.pathname}?${nextQuery}`
      : window.location.pathname;
    if (nextUrl !== `${window.location.pathname}${window.location.search}`) {
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel("realtime_groups")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "groups" },
        () => {
          scheduleRefreshGroups();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_members" },
        (payload) => {
          const row = payload.new as {
            group_id?: string;
            user_id?: string;
            nickname?: string | null;
            avatar_url?: string | null;
          };
          if (row?.user_id) {
            const patched = {
              id: row.user_id,
              nickname: row.nickname,
              avatar_url: row.avatar_url,
            };
            setGroups((prev) => applyUserProfileToGroups(prev, patched));
            setRoom((prev) =>
              prev ? applyUserProfileToGroups([prev], patched)[0] ?? prev : prev,
            );
          }
          scheduleRefreshGroups();
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "users" },
        (payload) => {
          const row = payload.new as {
            id?: string;
            nickname?: string | null;
            avatar_url?: string | null;
          };
          setGroups((prev) => applyUserProfileToGroups(prev, row));
          setRoom((prev) =>
            prev ? applyUserProfileToGroups([prev], row)[0] ?? prev : prev,
          );
          scheduleRefreshGroups();
        },
      )
      .subscribe();

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [scheduleRefreshGroups]);

  useEffect(() => {
    const onFocus = () => {
      scheduleRefreshGroups();
      void refreshNotices(true);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        scheduleRefreshGroups();
        void refreshNotices(true);
      }
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshNotices, scheduleRefreshGroups]);

  useEffect(() => {
    const onProfileUpdated = () => {
      void refreshGroups();
    };
    window.addEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    return () => {
      window.removeEventListener(PROFILE_UPDATED_EVENT, onProfileUpdated);
    };
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

  const visibleGroups = useMemo(
    () => overlayMyProfile(groups, { userId, nickname, avatar: myProfileImage }),
    [groups, userId, nickname, myProfileImage],
  );
  const myActiveGroups = useMemo(() => {
    if (!isLoggedIn() || !userId) return [];
    return listJoinedActiveGroups(visibleGroups, { userId, nickname }, joinedGroupIds);
  }, [visibleGroups, userId, nickname, joinedGroupIds, ready, hasNickname]);
  const joinLimit = useMemo(
    () => getEffectiveMaxJoinedGroups(pointsSnapshot),
    [pointsSnapshot],
  );

  function handlePointsEarned(result: PointAwardResult) {
    if (result.totalAwarded <= 0) return;
    void refreshPoints();
    setToast(result.messages.join(" · "));
  }
  const visibleRoom = useMemo(() => {
    if (!room) return null;
    return overlayMyProfile([room], { userId, nickname, avatar: myProfileImage })[0] ?? room;
  }, [room, userId, nickname, myProfileImage]);

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

  function resetAppSessionState(prevUserId?: string | null) {
    setJoinedGroupIds([]);
    setRoom(null);
    setFilter("joinable");
    setShowCreate(false);
    setShowNotices(false);
    setShowOnboarding(false);
    setShowLoginGate(false);
    setShowJoinLimit(false);
    setShowEntryDenied(false);
    clearPendingIntent();
    if (prevUserId) {
      clearPersistedJoinedIds(prevUserId);
    }
    clearImage();
  }

  async function handleLogout() {
    const prevUserId = userId;
    resetAppSessionState(prevUserId);
    await clearSession();
    setTab("find");
    window.location.href = "/";
  }

  async function handleWithdrawAccount() {
    const prevUserId = userId;
    resetAppSessionState(prevUserId);
    if (prevUserId) {
      await withdrawUserAccount(prevUserId);
    } else {
      await clearSession();
    }
    resetLocalSession();
    setTab("find");
    window.location.href = "/";
  }

  function handleCreate(g: Group) {
    setGroups((prev) => [g, ...prev.filter((item) => item.id !== g.id)]);
    setJoinedGroupIds((prev) => [
      g.id,
      ...prev.filter((id) => normalizeGroupId(id) !== normalizeGroupId(g.id)),
    ]);
    setFilter("mine");
    void refreshGroups();
  }

  function openCreateSheet(prefill: CreateGroupPrefill | null = null) {
    if (!requireAuth({ type: "create" })) return;
    void (async () => {
      if (myActiveGroups.length >= joinLimit) {
        setShowJoinLimit(true);
        return;
      }
      if (userId) {
        try {
          const memberships = await countUserMemberships(userId, nickname);
          if (memberships >= joinLimit) {
            setShowJoinLimit(true);
            return;
          }
        } catch (error) {
          console.error("membership count failed", error);
        }
      }
      setCreatePrefill(prefill);
      setShowCreate(true);
    })();
  }

  function tryOpenCreate() {
    openCreateSheet(null);
  }

  function handleCreateFromRunningTemplate(g: Group) {
    openCreateSheet(groupToCreatePrefill(g));
  }

  async function performQuitGroup(groupId: string) {
    if (!userId) {
      throw new Error("로그인이 필요합니다.");
    }
    const target = groups.find((item) => item.id === groupId);
    if (!target) {
      throw new Error("모임을 찾을 수 없습니다.");
    }

    const joinUserId = userId;
    const owner = isGroupOwner(target, userId);
    const remainingMembers = target.members.filter(
      (member) => member.id !== joinUserId && member.id !== "me",
    );

    const result = await quitChallengeGroup({
      groupId,
      userId: joinUserId,
      isOwner: owner,
      remainingMemberCount: remainingMembers.length,
    });

    const nextJoinedIds = joinedGroupIds.filter(
      (id) => normalizeGroupId(id) !== normalizeGroupId(groupId),
    );
    setJoinedGroupIds(nextJoinedIds);
    persistJoinedIds(userId, nextJoinedIds);

    if (result.type === "deleted") {
      setGroups((prev) => prev.filter((item) => item.id !== groupId));
      setToast("모임이 종료되었습니다");
    } else if (result.type === "handoff") {
      setGroups((prev) =>
        prev.map((item) => {
          if (item.id !== groupId) return item;
          const next: Group = {
            ...item,
            members: remainingMembers,
            ownerId: result.newOwnerId,
            createdBy: result.newOwnerId,
          };
          if (result.soloRecruit) {
            next.dbStatus = "recruiting";
            next.filter = "joinable";
            next.raceStatus = item.startedAt ? "started" : "recruiting";
          }
          return next;
        }),
      );
      setToast(
        result.soloRecruit
          ? "1명만 남아 특별 추가 모집이 시작됐어요. 모집 중 탭에서 탑승을 기다려 주세요."
          : owner
            ? "방장 권한을 넘기고 퇴장했습니다."
            : "챌린지에서 퇴장했습니다",
      );
    } else {
      setGroups((prev) =>
        prev.map((item) =>
          item.id === groupId ? { ...item, members: remainingMembers } : item,
        ),
      );
      setToast("챌린지에서 퇴장했습니다");
    }

    setRoom((current) => (current?.id === groupId ? null : current));
    await refreshGroups();
    return result;
  }

  async function openRoom(g: Group) {
    const member = isGroupMember(g, { userId, nickname });
    if (!canGuestJoinGroup(g, member) && !member) {
      setShowEntryDenied(true);
      setAutoOpenVerify(false);
      return;
    }
    setRoom(g);
  }

  async function joinGroup(g: Group) {
    if (!requireAuth({ type: "join", groupId: g.id })) return;

    const member = isGroupMember(g, { userId, nickname });
    if (member || isGroupOwner(g, userId)) {
      setRoom(g);
      return;
    }
    if (!canGuestJoinGroup(g, false)) {
      setShowEntryDenied(true);
      return;
    }
    if (g.members.length >= g.capacity) {
      setToast("모집이 마감되었습니다");
      setRoom(g);
      return;
    }

    const localJoinedCount = myActiveGroups.length;
    if (!userId && localJoinedCount >= joinLimit) {
      setShowJoinLimit(true);
      return;
    }
    if (userId) {
      try {
        const memberships = await countUserMemberships(userId, nickname);
        if (memberships >= joinLimit) {
          setShowJoinLimit(true);
          return;
        }
      } catch (error) {
        console.error("membership count failed", error);
        if (localJoinedCount >= joinLimit) {
          setShowJoinLimit(true);
          return;
        }
      }
    }

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

    const hadMembership = joinedGroupIds.some(
      (id) => normalizeGroupId(id) === normalizeGroupId(g.id),
    );
    if (!hadMembership) {
      setJoinedGroupIds((prev) => [...prev, g.id]);
    }

    if (userId) {
      try {
        await addGroupMember(g.id, userId, joined.members.length, {
          nickname: joinNickname,
          avatarUrl: myProfileImage,
        });
      } catch (error) {
        console.error("group join failed", error);
        if (!hadMembership) {
          setJoinedGroupIds((prev) =>
            prev.filter((id) => normalizeGroupId(id) !== normalizeGroupId(g.id)),
          );
        }
        const message = error instanceof Error ? error.message : "";
        if (message === JOIN_LIMIT_MESSAGE) {
          setShowJoinLimit(true);
        } else {
          setToast("모임 참여에 실패했습니다");
        }
        return;
      }
    }

    const refreshed = await refreshGroups();
    const fromDb = refreshed?.find((item) => item.id === g.id);
    setRoom(fromDb ?? joined);
    setToast("모임에 참여했습니다");

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
  }

  function handleOpenRoom(g: Group) {
    void openRoom(g);
  }

  function handleNoticeClick(notice: Notice) {
    const link = parseCheerLink(notice.content);
    if (!link) return;
    const target = groups.find(
      (item) => normalizeGroupId(item.id) === normalizeGroupId(link.groupId),
    );
    setShowNotices(false);
    if (target) {
      void openRoom(target);
    } else {
      setToast("모임 정보를 찾을 수 없습니다");
    }
  }

  function handleCheerNotice(notice: Notice) {
    if (notice.user_id && userId && notice.user_id === userId) {
      prependNotice(notice);
    }
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
      if (myActiveGroups.length >= joinLimit) {
        setShowJoinLimit(true);
        return;
      }
      if (userId) {
        void countUserMemberships(userId, nickname)
          .then((memberships) => {
            if (memberships >= joinLimit) {
              setShowJoinLimit(true);
              return;
            }
            setShowCreate(true);
          })
          .catch(() => {
            setShowCreate(true);
          });
        return;
      }
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
    if (intent.type === "join") {
      void joinGroup(target);
      return;
    }
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
                <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#00FF87] px-1 text-[10px] font-bold leading-none text-black">
                  {notices.length > 9 ? "9+" : notices.length}
                </span>
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
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          {tab === "info" && <InfoTab />}
          {tab === "find" && (
            <FindTab
              key={userId ?? "guest"}
              groups={visibleGroups}
              joinedGroupIds={joinedGroupIds}
              filter={filter}
              onFilterChange={setFilter}
              onOpenRoom={handleOpenRoom}
              onCreateFromRunningTemplate={handleCreateFromRunningTemplate}
              onJoinMidRace={(g) => joinGroup(g)}
              myUserId={userId}
              nickname={nickname}
              isLoggedIn={isLoggedIn()}
              loading={groupsLoading}
              error={groupsError}
              refreshing={groupsRefreshing}
              onRefresh={() => refreshGroups({ showSpinner: true })}
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
              profileImageUploading={profileImageUploading}
              groups={visibleGroups}
              joinedGroupIds={joinedGroupIds}
              myUserId={userId}
              onOpenRoom={handleOpenRoom}
              onLogout={() => void handleLogout()}
              onWithdrawAccount={() => void handleWithdrawAccount()}
              onQuitGroup={async (groupId) => {
                try {
                  await performQuitGroup(groupId);
                } catch (error) {
                  console.error("group quit failed", error);
                  setToast("챌린지 퇴장에 실패했습니다");
                  await refreshGroups();
                  throw error;
                }
              }}
              onGoFind={() => {
                setFilter("joinable");
                setTab("find");
              }}
              userPoints={userPoints}
              extraGroupSlots={extraGroupSlots}
              maxJoinedGroups={joinLimit}
              heartBonusByGroup={heartBonusByGroup}
              onPointsToast={setToast}
              onPointsSnapshot={applyPointsSnapshot}
              onRefreshPoints={refreshPoints}
            />
          )}
        </main>

        {/* 하단 탭바 */}
        <BottomNav active={tab} onChange={handleTabChange} />

        {/* 새 모임 개설 FAB — 모바일 프레임 기준 탭바 바로 위 고정 */}
        {tab === "find" && (
          <button
            onClick={() => tryOpenCreate()}
            aria-label="새 모임 개설"
            className="absolute bottom-20 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#00FF87] text-black shadow-[0_8px_24px_#00FF8766] transition-transform active:scale-90"
          >
            <Plus size={28} strokeWidth={2.6} />
          </button>
        )}

        {/* 오버레이들 */}
        {visibleRoom && (
          <RoomDetail
            group={visibleRoom}
            onBack={() => {
              setRoom(null);
              setAutoOpenVerify(false);
            }}
            nickname={nickname}
            myAvatar={myProfileImage}
            userId={userId}
            requireAuth={() =>
              requireAuth({ type: "verify", groupId: visibleRoom.id })
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
            onJoinGroup={(target) => joinGroup(target)}
            onDeleteGroup={(groupId) => {
              void (async () => {
                try {
                  const result = await performQuitGroup(groupId);
                  if (result.type === "deleted") {
                    setToast("모임을 삭제했습니다");
                  }
                } catch (error) {
                  console.error("owner quit/delete failed", error);
                  setToast("처리에 실패했습니다");
                }
              })();
            }}
            onPointsEarned={handlePointsEarned}
            onCheerNotice={handleCheerNotice}
            onToast={setToast}
          />
        )}

        <EntryDeniedModal
          open={showEntryDenied}
          onClose={() => setShowEntryDenied(false)}
        />

        <JoinLimitModal
          open={showJoinLimit}
          onClose={() => setShowJoinLimit(false)}
        />

        <NoticesSheet
          open={showNotices}
          onClose={() => setShowNotices(false)}
          notices={notices}
          loading={noticesLoading}
          error={noticesError}
          onDeleteNotice={removeNotice}
          onNoticeClick={handleNoticeClick}
        />

        <CreateGroupSheet
          open={showCreate}
          prefill={createPrefill}
          onClose={() => {
            setShowCreate(false);
            setCreatePrefill(null);
          }}
          onCreate={handleCreate}
          onJoinLimit={() => setShowJoinLimit(true)}
          joinedCount={myActiveGroups.length}
          maxJoinedGroups={joinLimit}
          onCreatedNotice={prependNotice}
          onNoticesRefresh={() => {
            void refreshNotices(true);
          }}
          ownerId={userId || "me"}
          ownerName={nickname || "나"}
          ownerAvatar={myProfileImage || ME_AVATAR}
        />

        <HostPromotionModal
          open={Boolean(hostPromo)}
          displayName={hostPromo?.displayName ?? "멤버"}
          onContinue={() => {
            if (!hostPromo) return;
            const notice = notices.find((item) => item.id === hostPromo.noticeId);
            if (notice) void removeNotice(notice);
            const target = groups.find(
              (item) => normalizeGroupId(item.id) === normalizeGroupId(hostPromo.groupId),
            );
            setHostPromo(null);
            if (target) {
              setRoom(target);
              setTab("find");
            }
          }}
          onClose={() => {
            if (!hostPromo) return;
            const notice = notices.find((item) => item.id === hostPromo.noticeId);
            if (notice) void removeNotice(notice);
            setHostPromo(null);
          }}
        />

        <LoginGateModal
          open={showLoginGate}
          onClose={() => {
            setShowLoginGate(false);
            clearPendingIntent();
          }}
          onLogin={() => {
            setShowLoginGate(false);
            void reconcileOnboarding({ openLoginWhenSignedOut: true });
          }}
        />

        <Onboarding
          open={showOnboarding}
          required={false}
          currentUserId={userId}
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
