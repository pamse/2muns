import {
  GROUP_COVERS,
  memberColor,
  type Group,
  type GroupStatus,
  type Member,
} from "@/app/data";
import { cacheBustAvatarUrl } from "@/lib/profile";
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

export function challengeDayFromStart(startedAt: string | null | undefined, status: string | null | undefined) {
  const started = status === "started" || status === "ongoing";
  if (!started) return 0;
  if (!startedAt) return 1;
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return 1;
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const now = new Date();
  const nowUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((nowUtc - startUtc) / 86_400_000) + 1;
  return Math.max(1, Math.min(TOTAL_DAYS, days));
}

function mapStatus(status: string | null | undefined): { filter: GroupStatus; raceStatus: Group["raceStatus"] } {
  if (status === "started" || status === "ongoing") {
    return { filter: "ongoing", raceStatus: "started" };
  }
  return { filter: "joinable", raceStatus: "recruiting" };
}

export function mapAppGroup(row: AppGroup, members: Member[]): Group {
  const { filter, raceStatus } = mapStatus(row.status);
  return {
    id: row.id,
    name: row.title,
    intro: row.description || "",
    icon: "🔥",
    gradient: memberColor(0),
    cover: coverForId(row.id),
    day: challengeDayFromStart(row.started_at, row.status),
    total: TOTAL_DAYS,
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

export async function fetchAppGroups(): Promise<Group[]> {
  const { data: groupRows, error: groupError } = await supabase
    .from("groups")
    .select("*")
    .order("created_at", { ascending: false });

  if (groupError) {
    throw new Error(groupError.message || "모임 목록을 불러오지 못했습니다.");
  }

  const groups = (groupRows ?? []) as AppGroup[];
  if (groups.length === 0) return [];

  const ids = groups.map((row) => row.id);
  const { data: memberRows, error: memberError } = await supabase
    .from("group_members")
    .select("group_id, user_id")
    .in("group_id", ids);

  if (memberError) {
    throw new Error(memberError.message || "모임 멤버를 불러오지 못했습니다.");
  }

  const memberships = memberRows ?? [];
  const userIds = [...new Set(memberships.map((row) => row.user_id))];
  const usersById = new Map<string, AppUser>();

  if (userIds.length > 0) {
    const { data: userRows, error: userError } = await supabase
      .from("users")
      .select("id, nickname, avatar_url")
      .in("id", userIds);

    if (userError) {
      console.error("users select failed", userError);
    } else {
      for (const user of userRows ?? []) {
        usersById.set(user.id, user as AppUser);
      }
    }
  }

  const membersByGroup = new Map<string, Member[]>();
  for (const row of memberships) {
    const user = usersById.get(row.user_id);
    const list = membersByGroup.get(row.group_id) ?? [];
    list.push({
      id: row.user_id,
      name: user?.nickname || "멤버",
      color: memberColor(list.length),
      avatar: user?.avatar_url ? cacheBustAvatarUrl(user.avatar_url, user.id) : "",
    });
    membersByGroup.set(row.group_id, list);
  }

  return groups.map((row) => mapAppGroup(row, membersByGroup.get(row.id) ?? []));
}

export function overlayMyProfile(
  groups: Group[],
  me: { userId?: string | null; nickname?: string | null; avatar?: string | null },
): Group[] {
  const avatar = me.avatar?.trim() || "";
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
