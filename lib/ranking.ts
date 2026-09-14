import type { AppUser } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";

type RankingUserRow = Pick<AppUser, "id" | "nickname" | "avatar_url" | "points">;

/** MY 탭 실시간 랭킹 항목 */
export type RankUser = {
  rank: number;
  userId: string;
  name: string;
  color: string;
  points: number;
  avatarUrl: string;
  me?: boolean;
};

const RANK_COLORS = [
  "linear-gradient(135deg,#a3e635,#22c55e)",
  "linear-gradient(135deg,#f59e0b,#ef4444)",
  "linear-gradient(135deg,#a855f7,#6366f1)",
  "linear-gradient(135deg,#f472b6,#fb7185)",
  "linear-gradient(135deg,#22d3ee,#3b82f6)",
] as const;

const ME_COLOR = "linear-gradient(135deg,#00FF87,#0ea5e9)";

function rankColor(index: number, isMe: boolean) {
  if (isMe) return ME_COLOR;
  return RANK_COLORS[index % RANK_COLORS.length];
}

function displayName(nickname: string | null | undefined) {
  const trimmed = nickname?.trim();
  return trimmed || "익명";
}

function mapRankingRow(
  row: RankingUserRow,
  index: number,
  currentUserId?: string | null,
): RankUser {
  const isMe = Boolean(currentUserId && row.id === currentUserId);
  return {
    rank: index + 1,
    userId: row.id,
    name: displayName(row.nickname),
    color: rankColor(index, isMe),
    points: row.points ?? 0,
    avatarUrl: row.avatar_url?.trim() ?? "",
    me: isMe,
  };
}

export async function fetchTopRankedUsers(
  currentUserId?: string | null,
): Promise<RankUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id, nickname, avatar_url, points")
    .gt("points", 0)
    .order("points", { ascending: false })
    .limit(5);

  if (error) {
    console.error("fetchTopRankedUsers failed", error);
    return [];
  }

  return (data ?? []).map((row, index) =>
    mapRankingRow(row as RankingUserRow, index, currentUserId),
  );
}

/** 1P 이상일 때만 순위 반환. 0P 이하면 null */
export async function fetchMyRank(points: number): Promise<number | null> {
  if (points <= 0) return null;

  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .gt("points", points);

  if (error) {
    console.error("fetchMyRank failed", error);
    return null;
  }

  return (count ?? 0) + 1;
}

export async function fetchLiveRanking(options: {
  userId?: string | null;
  points: number;
}) {
  const [topFive, rank] = await Promise.all([
    fetchTopRankedUsers(options.userId),
    fetchMyRank(options.points),
  ]);

  return { topFive, rank };
}
