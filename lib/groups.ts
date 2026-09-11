import {
  GROUP_COVERS,
  memberColor,
  type Group,
  type GroupStatus,
  type Member,
} from "@/app/data";
import { challengeDayNumber } from "@/lib/dates";
import { cacheBustAvatarUrl, pickMemberAvatarUrl } from "@/lib/profile";
import { supabase } from "@/lib/supabase";
import type { AppGroup, AppUser } from "@/lib/database.types";

const TOTAL_DAYS = 66;

function parseHour(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const hour = Number.parseInt(value.slice(0, 2), 10);
  return Number.isFinite(hour) ? hour : fallback;
}

function coverForId(id: string) {
  let hash = 0;
  for (const char of id) {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return GROUP_COVERS[Math.abs(hash) % GROUP_COVERS.length];
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
    Boolean(startedAt)
  );
}

export function challengeDayFromStart(startedAt: string | null | undefined, status: string | null | undefined) {
  if (!isStartedGroupStatus(status, startedAt)) return 0;
  if (!startedAt) return 1;
  return challengeDayNumber(startedAt, new Date(), TOTAL_DAYS);
}

function mapStatus(status: string | null | undefined, startedAt?: string | null): { filter: GroupStatus; raceStatus: Group["raceStatus"] } {
  if (isStartedGroupStatus(status, startedAt)) {
    return { filter: "ongoing", raceStatus: "started" };
  }
  return { filter: "joinable", raceStatus: "recruiting" };
}

export function mapAppGroup(row: AppGroup, members: Member[]): Group {
  const { filter, raceStatus } = mapStatus(row.status, row.started_at);
  return {
    id: row.id,
    name: row.title,
    intro: row.description || "",
    icon: "🔥",
    gradient: memberColor(0),
    cover: coverForId(row.id),
    day: challengeDayFromStart(row.started_at, row.status),
    total: TOTAL_DAYS,
    startedAt: row.started_at,
    capacity: row.max_capacity || 6,
    members,
    filter,
    ownerId: row.owner_id || members[0]?.id,
    verifyAnytime: Boolean(row.is_flexible),
    verifyStartHour: parseHour(row.auth_start_time, 5),
    verifyEndHour: parseHour(row.auth_end_time, 9),
    category: row.category,
    raceStatus,
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
    .select("*")
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
  const userIds = [...new Set(memberships.map((row) => row.user_id).filter(Boolean))];
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

  return groupRows.map((row) => mapAppGroup(row, membersByGroup.get(row.id) ?? []));
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

export async function addGroupMember(
  groupId: string,
  userId: string,
  memberCount: number,
  profile?: { nickname?: string | null; avatarUrl?: string | null },
) {
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
