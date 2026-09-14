import {
  JOIN_LIMIT_MESSAGE,
  MAX_JOINED_GROUPS,
  isActiveChallengeGroup,
  isCompletedGroupStatus,
  isEndedGroupStatus,
  isGroupMember,
  memberColor,
  normalizeGroupId,
  resolveUserJoinedGroupIds,
  type Group,
  type GroupStatus,
  type Member,
} from "@/app/data";
import { getCategoryThumbnail } from "@/lib/categories";
import { isAdditionalRecruitingActive } from "@/lib/groupRecruiting";
import { challengeDayNumber } from "@/lib/dates";
import { getUserJoinLimit } from "@/lib/points";
import { cacheBustAvatarUrl, pickMemberAvatarUrl } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import type { AppGroup, AppUser } from "@/lib/database.types";

const TOTAL_DAYS = 66;
const JOINED_IDS_STORAGE_PREFIX = "muns:joined-groups:";

export function readPersistedJoinedIds(userId: string): string[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = window.localStorage.getItem(`${JOINED_IDS_STORAGE_PREFIX}${userId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function persistJoinedIds(userId: string, ids: Iterable<string>) {
  if (typeof window === "undefined" || !userId) return;
  try {
    const unique = [...new Set([...ids].map(normalizeGroupId).filter(Boolean))];
    window.localStorage.setItem(
      `${JOINED_IDS_STORAGE_PREFIX}${userId}`,
      JSON.stringify(unique),
    );
  } catch {
    // localStorage 접근 불가 시 무시
  }
}

export function clearPersistedJoinedIds(userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      window.localStorage.removeItem(`${JOINED_IDS_STORAGE_PREFIX}${userId}`);
      return;
    }
    clearAllJoinedGroupCaches();
  } catch {
    // localStorage 접근 불가 시 무시
  }
}

export function clearAllJoinedGroupCaches() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(JOINED_IDS_STORAGE_PREFIX)) {
        keys.push(key);
      }
    }
    for (const key of keys) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // localStorage 접근 불가 시 무시
  }
}

async function resolveMembershipUserIds(
  userId: string,
  nickname?: string | null,
): Promise<string[]> {
  const primary = normalizeGroupId(userId);
  if (primary) return [primary];

  const trimmed = nickname?.trim();
  if (!trimmed) return [];

  const { data: profiles } = await supabase
    .from("users")
    .select("id")
    .ilike("nickname", trimmed)
    .order("nickname_updated_at", { ascending: false, nullsFirst: false })
    .limit(1);
  const resolved = normalizeGroupId(profiles?.[0]?.id);
  return resolved ? [resolved] : [];
}

function parseHour(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const hour = Number.parseInt(value.slice(0, 2), 10);
  return Number.isFinite(hour) ? hour : fallback;
}

export function isStartedGroupStatus(
  status?: string | null,
  startedAt?: string | null,
) {
  const value = (status || "").trim().toLowerCase();
  return (
    value === "started" ||
    value === "ongoing" ||
    value === "active" ||
    value === "active_recruiting" ||
    Boolean(startedAt)
  );
}

export function challengeDayFromStart(startedAt: string | null | undefined, status: string | null | undefined) {
  if (!isStartedGroupStatus(status, startedAt)) return 0;
  if (!startedAt) return 1;
  return challengeDayNumber(startedAt, new Date(), TOTAL_DAYS);
}

function groupCreatorId(row: AppGroup) {
  const extra = row as AppGroup & { created_by?: string | null };
  return extra.owner_id || extra.created_by || null;
}

function mapStatus(status: string | null | undefined, startedAt?: string | null): { filter: GroupStatus; raceStatus: Group["raceStatus"] } {
  if (isStartedGroupStatus(status, startedAt)) {
    return { filter: "ongoing", raceStatus: "started" };
  }
  return { filter: "joinable", raceStatus: "recruiting" };
}

export function mapAppGroup(row: AppGroup, members: Member[]): Group {
  const { filter, raceStatus } = mapStatus(row.status, row.started_at);
  const creatorId = groupCreatorId(row);
  return {
    id: row.id,
    name: row.title,
    intro: row.description || "",
    icon: "🔥",
    gradient: memberColor(0),
    cover: getCategoryThumbnail(row.category),
    day: challengeDayFromStart(row.started_at, row.status),
    total: TOTAL_DAYS,
    startedAt: row.started_at,
    capacity: row.max_capacity || 6,
    members,
    filter,
    ownerId: creatorId || members[0]?.id,
    createdBy: creatorId || undefined,
    verifyAnytime: Boolean(row.is_flexible),
    verifyStartHour: parseHour(row.auth_start_time, 5),
    verifyEndHour: parseHour(row.auth_end_time, 9),
    category: row.category,
    raceStatus,
    dbStatus: row.status,
    additionalRecruitingUntil: row.additional_recruiting_until ?? null,
  };
}

type MemberRow = {
  group_id: string;
  user_id: string;
  nickname?: string | null;
  avatar_url?: string | null;
};

function pickProfileText(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function resolvedMemberAvatar(row: MemberRow, profile: AppUser | null) {
  const raw = pickMemberAvatarUrl({
    avatar_url: profile?.avatar_url ?? row.avatar_url,
    profile,
    avatar: row.avatar_url,
  });
  return raw ? cacheBustAvatarUrl(raw, `${row.user_id}:${raw}`) : "";
}

async function fetchMemberships(groupIds: string[]): Promise<MemberRow[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("group_id, user_id")
    .in("group_id", groupIds);

  if (error) {
    throw new Error(error.message || "모임 멤버를 불러오지 못했습니다.");
  }

  return (data ?? []) as MemberRow[];
}

async function fetchProfilesByUserIds(userIds: string[]): Promise<Map<string, AppUser>> {
  const profilesById = new Map<string, AppUser>();
  if (userIds.length === 0) return profilesById;

  const { data, error } = await supabase
    .from("users")
    .select("id, nickname, avatar_url")
    .in("id", userIds);

  if (error) {
    return profilesById;
  }

  for (const row of data ?? []) {
    const profile = row as AppUser;
    if (profile.id) profilesById.set(profile.id, profile);
  }

  return profilesById;
}

async function hydrateGroups(groupRows: AppGroup[]): Promise<Group[]> {
  if (groupRows.length === 0) return [];

  const ids = groupRows.map((row) => row.id);
  const memberships = await fetchMemberships(ids);
  const userIds = [
    ...new Set(
      [
        ...memberships.map((row) => row.user_id),
        ...groupRows.map((row) => groupCreatorId(row)),
      ].filter(Boolean) as string[],
    ),
  ];
  const profilesById = await fetchProfilesByUserIds(userIds);

  const membersByGroup = new Map<string, Member[]>();
  for (const row of memberships) {
    const profile = profilesById.get(row.user_id) ?? null;
    const list = membersByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.user_id,
      name: pickProfileText(profile?.nickname, row.nickname, "멤버") || "멤버",
      color: memberColor(list.length),
      avatar: resolvedMemberAvatar(row, profile),
    });
    membersByGroup.set(row.group_id, list);
  }

  for (const row of groupRows) {
    const creatorId = groupCreatorId(row);
    if (!creatorId) continue;
    const list = membersByGroup.get(row.id) ?? [];
    if (list.some((member) => member.id === creatorId)) continue;
    const profile = profilesById.get(creatorId) ?? null;
    list.unshift({
      id: creatorId,
      name: pickProfileText(profile?.nickname, "멤버") || "멤버",
      color: memberColor(list.length),
      avatar: resolvedMemberAvatar(
        { group_id: row.id, user_id: creatorId, nickname: profile?.nickname, avatar_url: profile?.avatar_url },
        profile,
      ),
    });
    membersByGroup.set(row.id, list);
  }

  const mapped = groupRows.map((row) =>
    mapAppGroup(row, membersByGroup.get(row.id) ?? []),
  );
  for (const group of mapped) {
    if (
      group.additionalRecruitingUntil &&
      !isAdditionalRecruitingActive(group)
    ) {
      void clearExpiredAdditionalRecruiting(group.id, group.additionalRecruitingUntil);
    }
  }
  return mapped;
}

export function ensureJoinedMembership(
  groups: Group[],
  joinedIds: Iterable<string>,
  me: { userId: string; nickname?: string | null; avatar?: string | null },
): Group[] {
  const ids = new Set([...joinedIds].map(normalizeGroupId).filter(Boolean));
  if (ids.size === 0) return groups;

  return groups.map((group) => {
    if (!ids.has(normalizeGroupId(group.id)) || isGroupMember(group, me)) return group;
    return {
      ...group,
      members: [
        ...group.members,
        {
          id: me.userId,
          name: me.nickname?.trim() || "나",
          color: memberColor(group.members.length),
          avatar: me.avatar || "",
        },
      ],
    };
  });
}

async function fetchMissingJoinedGroups(
  groups: Group[],
  joinedIds: Iterable<string>,
): Promise<Group[]> {
  const known = new Set(groups.map((group) => normalizeGroupId(group.id)));
  const missing = [...joinedIds]
    .map(normalizeGroupId)
    .filter((id) => id && !known.has(id));
  if (missing.length === 0) return groups;

  const { data, error } = await supabase.from("groups").select("*").in("id", missing);
  if (error || !data?.length) return groups;

  const hydrated = await hydrateGroups(data as AppGroup[]);
  const merged = new Map(groups.map((group) => [normalizeGroupId(group.id), group]));
  for (const group of hydrated) {
    merged.set(normalizeGroupId(group.id), group);
  }
  return [...merged.values()];
}

export async function fetchAppGroups(): Promise<Group[]> {
  const { data: groupRows, error: groupError } = await supabase
    .from("groups")
    .select("*")
    .order("created_at", { ascending: false });

  if (groupError) {
    throw new Error(groupError.message || "모임 목록을 불러오지 못했습니다.");
  }

  return hydrateGroups((groupRows ?? []) as AppGroup[]);
}

export async function fetchAppGroupById(id: string): Promise<Group | null> {
  const { data, error } = await supabase
    .from("groups")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || "모임 정보를 불러오지 못했습니다.");
  }
  if (!data) return null;
  const [group] = await hydrateGroups([data as AppGroup]);
  return group ?? null;
}

export async function startGroupRace(groupId: string, startedAt: string) {
  const attempts: Array<{ status?: string; started_at: string }> = [
    { status: "started", started_at: startedAt },
    { status: "active", started_at: startedAt },
    { status: "ongoing", started_at: startedAt },
    { started_at: startedAt },
  ];

  for (const patch of attempts) {
    const { data, error } = await supabase
      .from("groups")
      .update(patch)
      .eq("id", groupId)
      .select("id, status, started_at")
      .maybeSingle();
    if (!error && data) {
      return data;
    }
    console.error("groups race start update failed", error, patch);
  }
  return null;
}

export function overlayMyProfile(
  groups: Group[],
  me: { userId?: string | null; nickname?: string | null; avatar?: string | null },
): Group[] {
  const rawAvatar = me.avatar?.trim() || "";
  const avatar = rawAvatar ? cacheBustAvatarUrl(rawAvatar, rawAvatar) : "";
  const nickname = me.nickname?.trim() || "";
  if (!me.userId && !nickname && !avatar) return groups;

  return groups.map((group) => ({
    ...group,
    members: group.members.map((member) => {
      const isMe =
        member.id === "me" || (Boolean(me.userId) && member.id === me.userId);
      if (!isMe) return member;
      return {
        ...member,
        name: nickname || member.name,
        avatar: avatar || member.avatar,
      };
    }),
  }));
}

export function applyUserProfileToGroups(
  groups: Group[],
  row: { id?: string | null; nickname?: string | null; avatar_url?: string | null },
): Group[] {
  if (!row.id) return groups;
  const nickname = row.nickname?.trim() || "";
  const avatar = cacheBustAvatarUrl(row.avatar_url, Date.now());
  if (!nickname && !avatar) return groups;

  return groups.map((group) => ({
    ...group,
    members: group.members.map((member) => {
      if (member.id !== row.id) return member;
      return {
        ...member,
        name: nickname || member.name,
        avatar: avatar || member.avatar,
      };
    }),
  }));
}

export async function fetchUserCompletedGroups(
  userId: string,
  nickname?: string | null,
): Promise<Group[]> {
  const membershipUserIds = await resolveMembershipUserIds(userId, nickname);
  if (membershipUserIds.length === 0) return [];

  const groupIds = new Set<string>();
  const { data: memberRows, error: memberError } = await supabase
    .from("group_members")
    .select("group_id")
    .in("user_id", membershipUserIds);

  if (memberError) {
    throw new Error(memberError.message || "완주 모임을 불러오지 못했습니다.");
  }

  for (const row of memberRows ?? []) {
    const id = normalizeGroupId(row.group_id);
    if (id) groupIds.add(id);
  }

  for (const membershipUserId of membershipUserIds) {
    const ownerResult = await supabase
      .from("groups")
      .select("id")
      .eq("owner_id", membershipUserId);
    if (!ownerResult.error) {
      for (const row of ownerResult.data ?? []) {
        const id = normalizeGroupId(row.id);
        if (id) groupIds.add(id);
      }
    }
  }

  if (groupIds.size === 0) return [];

  const { data: groupRows, error: groupError } = await supabase
    .from("groups")
    .select("*")
    .in("id", [...groupIds]);

  if (groupError) {
    throw new Error(groupError.message || "완주 모임을 불러오지 못했습니다.");
  }

  const completedRows = (groupRows ?? []).filter((row) =>
    isCompletedGroupStatus(row.status),
  );
  if (completedRows.length === 0) return [];

  return hydrateGroups(completedRows as AppGroup[]);
}

export async function fetchUserActiveGroupIds(
  userId: string,
  knownGroups: Group[] = [],
  nickname?: string | null,
) {
  const ids = new Set<string>();
  const membershipUserIds = await resolveMembershipUserIds(userId, nickname);

  if (membershipUserIds.length > 0) {
    const { data: memberRows, error: memberError } = await supabase
      .from("group_members")
      .select("group_id")
      .in("user_id", membershipUserIds);
    if (memberError) {
      throw new Error(memberError.message || "참여 중인 모임 수를 확인할 수 없습니다.");
    }
    for (const row of memberRows ?? []) {
      const id = normalizeGroupId(row.group_id);
      if (id) ids.add(id);
    }

    for (const membershipUserId of membershipUserIds) {
      const ownerResult = await supabase
        .from("groups")
        .select("id, status")
        .eq("owner_id", membershipUserId);
      if (!ownerResult.error) {
        for (const row of ownerResult.data ?? []) {
          const id = normalizeGroupId(row.id);
          if (id) ids.add(id);
        }
      }
    }
  }

  if (ids.size === 0) return [];

  const knownById = new Map(
    knownGroups.map((group) => [normalizeGroupId(group.id), group]),
  );
  const unresolved = [...ids].filter((id) => !knownById.has(id));

  let statusById = new Map<string, string | null>();
  if (unresolved.length > 0) {
    const { data: groupRows, error: groupError } = await supabase
      .from("groups")
      .select("id, status")
      .in("id", unresolved);
    if (!groupError) {
      statusById = new Map(
        (groupRows ?? []).map((row) => [normalizeGroupId(row.id), row.status]),
      );
    }
  }

  return [...ids].filter((id) => {
    const known = knownById.get(id);
    if (known) return isActiveChallengeGroup(known);
    const status = statusById.get(id);
    if (status === undefined) return true;
    return !isEndedGroupStatus(status);
  });
}

export async function hydrateUserGroups(
  userId: string,
  me: { nickname?: string | null; avatar?: string | null },
): Promise<{ groups: Group[]; joinedIds: string[] }> {
  let groups = await fetchAppGroups();
  const persistedIds = readPersistedJoinedIds(userId);
  let serverJoinedIds: string[] = [];
  try {
    serverJoinedIds = await fetchUserActiveGroupIds(userId, groups, me.nickname);
  } catch (error) {
    console.error("active membership fetch failed", error);
  }

  let joinedIds = resolveUserJoinedGroupIds(
    groups,
    { userId, nickname: me.nickname },
    [...serverJoinedIds, ...persistedIds],
  );
  groups = ensureJoinedMembership(groups, joinedIds, {
    userId,
    nickname: me.nickname,
    avatar: me.avatar,
  });
  joinedIds = resolveUserJoinedGroupIds(
    groups,
    { userId, nickname: me.nickname },
    joinedIds,
  );
  groups = await fetchMissingJoinedGroups(groups, joinedIds);
  joinedIds = resolveUserJoinedGroupIds(
    groups,
    { userId, nickname: me.nickname },
    joinedIds,
  );
  groups = ensureJoinedMembership(groups, joinedIds, {
    userId,
    nickname: me.nickname,
    avatar: me.avatar,
  });

  persistJoinedIds(userId, joinedIds);
  return { groups, joinedIds };
}

export async function countUserMemberships(
  userId: string,
  nickname?: string | null,
) {
  const ids = await fetchUserActiveGroupIds(userId, [], nickname);
  return ids.length;
}

async function resolveJoinLimit(userId: string) {
  try {
    return await getUserJoinLimit(userId);
  } catch {
    return MAX_JOINED_GROUPS;
  }
}

export async function addGroupMember(
  groupId: string,
  userId: string,
  memberCount: number,
  profile?: { nickname?: string | null; avatarUrl?: string | null },
) {
  const joinedIds = new Set(
    await fetchUserActiveGroupIds(userId, [], profile?.nickname),
  );
  const joinLimit = await resolveJoinLimit(userId);
  if (
    !joinedIds.has(normalizeGroupId(groupId)) &&
    joinedIds.size >= joinLimit
  ) {
    throw new Error(JOIN_LIMIT_MESSAGE);
  }

  const row = {
    group_id: groupId,
    user_id: userId,
    ...(profile?.nickname ? { nickname: profile.nickname } : {}),
    ...(profile?.avatarUrl ? { avatar_url: profile.avatarUrl } : {}),
  };

  let { error } = await supabase.from("group_members").insert(row);
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    ({ error } = await supabase.from("group_members").insert({
      group_id: groupId,
      user_id: userId,
    }));
  }
  if (error && error.code !== "23505") {
    throw new Error(error.message || "모임 참여에 실패했습니다.");
  }

  const { error: countError } = await supabase
    .from("groups")
    .update({ current_count: memberCount })
    .eq("id", groupId);
  if (countError) {
    console.error("groups current_count update failed", countError);
  }
}

export async function removeGroupMember(groupId: string, userId: string, memberCount: number) {
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (error) {
    throw new Error(error.message || "모임 탈퇴에 실패했습니다.");
  }

  const { error: countError } = await supabase
    .from("groups")
    .update({ current_count: memberCount })
    .eq("id", groupId);
  if (countError) {
    console.error("groups current_count update failed", countError);
  }
}

export type QuitChallengeResult =
  | { type: "left" }
  | { type: "deleted" }
  | {
      type: "handoff";
      newOwnerId: string;
      additionalRecruitingUntil: string | null;
    };

/** 멤버 퇴장 / 방장 퇴장(권한 위임·24h 추가 모집·단독 시 삭제) */
export async function quitChallengeGroup(options: {
  groupId: string;
  userId: string;
  isOwner: boolean;
  remainingMemberCount: number;
}): Promise<QuitChallengeResult> {
  const { groupId, userId, isOwner } = options;

  if (!isOwner) {
    await removeGroupMember(groupId, userId, options.remainingMemberCount);
    return { type: "left" };
  }

  const { data: groupRow, error: groupError } = await supabase
    .from("groups")
    .select("id, status, started_at, title")
    .eq("id", groupId)
    .maybeSingle();

  if (groupError) {
    throw new Error(groupError.message || "모임 정보를 불러오지 못했습니다.");
  }
  if (!groupRow) {
    throw new Error("모임을 찾을 수 없습니다.");
  }

  const { data: memberRows, error: membersError } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId);

  if (membersError) {
    throw new Error(membersError.message || "멤버 목록을 불러오지 못했습니다.");
  }

  const rows = memberRows ?? [];
  const remaining = rows
    .filter((row) => row.user_id !== userId)
    .sort((a, b) => a.user_id.localeCompare(b.user_id));

  if (remaining.length === 0) {
    const { error: leaveError } = await supabase
      .from("group_members")
      .delete()
      .eq("group_id", groupId)
      .eq("user_id", userId);
    if (leaveError) {
      throw new Error(leaveError.message || "모임 탈퇴에 실패했습니다.");
    }

    const { data: stillThere, error: recheckError } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .limit(1);
    if (recheckError) {
      throw new Error(recheckError.message || "멤버 확인에 실패했습니다.");
    }

    if ((stillThere?.length ?? 0) > 0) {
      const { error: wipeMembersError } = await supabase
        .from("group_members")
        .delete()
        .eq("group_id", groupId);
      if (wipeMembersError) {
        throw new Error(wipeMembersError.message || "멤버 정리에 실패했습니다.");
      }
    }

    const { error: deleteError } = await supabase.from("groups").delete().eq("id", groupId);
    if (deleteError) {
      throw new Error(deleteError.message || "모임 삭제에 실패했습니다.");
    }
    return { type: "deleted" };
  }

  const newOwnerId = remaining[0]!.user_id;

  const { error: updateError } = await supabase
    .from("groups")
    .update({
      owner_id: newOwnerId,
      current_count: remaining.length,
    })
    .eq("id", groupId);
  if (updateError) {
    throw new Error(updateError.message || "방장 위임에 실패했습니다.");
  }

  const { error: leaveError } = await supabase
    .from("group_members")
    .delete()
    .eq("group_id", groupId)
    .eq("user_id", userId);
  if (leaveError) {
    throw new Error(leaveError.message || "모임 탈퇴에 실패했습니다.");
  }

  const { data: newOwnerProfile } = await supabase
    .from("users")
    .select("nickname")
    .eq("id", newOwnerId)
    .maybeSingle();
  const displayName = newOwnerProfile?.nickname?.trim() || "멤버";

  try {
    await supabase.from("notices").insert({
      user_id: newOwnerId,
      title: `끝까지 달리는 ${displayName} 님, 멋져요! 👑`,
      content: `host_promotion:${groupId}:${displayName}`,
      tag: "방장위임",
      is_active: true,
    });
  } catch (noticeError) {
    console.error("host promotion notice insert failed", noticeError);
  }

  return {
    type: "handoff",
    newOwnerId,
    additionalRecruitingUntil: null,
  };
}

/** 만료된 추가 모집 창 정리 (컬럼 없으면 no-op) */
export async function clearExpiredAdditionalRecruiting(_groupId: string, until: string | null) {
  if (!until || isAdditionalRecruitingActive({ additionalRecruitingUntil: until })) {
    return;
  }
}
