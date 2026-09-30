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

function normalizePoints(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const AUTH_USER_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidAuthUserId(userId: string | null | undefined): userId is string {
  const trimmed = userId?.trim();
  return Boolean(trimmed && AUTH_USER_ID_RE.test(trimmed));
}

function findMeInTopFive(topFive: RankUser[], currentUserId?: string | null) {
  if (!topFive.length) return undefined;
  const uid = currentUserId?.trim();
  return topFive.find(
    (row) =>
      row.me === true ||
      (uid != null && uid.length > 0 && row.userId === uid),
  );
}

function normalizeRankingRow(row: RankingUserRow): RankingUserRow {
  return {
    ...row,
    points: normalizePoints(row.points),
  };
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
    points: row.points,
    avatarUrl: row.avatar_url?.trim() ?? "",
    me: isMe,
  };
}

/** 로컬 포인트가 DB에 반영되지 않은 경우 랭킹 조회 전 동기화 */
async function ensureCurrentUserPointsVisible(
  userId: string | null | undefined,
  points: number,
) {
  if (!isValidAuthUserId(userId) || points <= 0) return;

  const { error } = await supabase
    .from("users")
    .update({ points })
    .eq("id", userId);

  if (error) {
    console.error("ensureCurrentUserPointsVisible failed:", error);
  }
}

export async function fetchTopRankedUsers(
  currentUserId?: string | null,
): Promise<RankUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id, nickname, avatar_url, points")
    .not("points", "is", null)
    .gt("points", 0)
    .order("points", { ascending: false })
    .limit(5);

  if (error) {
    console.error("fetchTopRankedUsers query error:", error);
    return [];
  }

  const rows = (data ?? [])
    .map((row) => normalizeRankingRow(row as RankingUserRow))
    .filter((row) => row.points > 0);

  return rows.map((row, index) => mapRankingRow(row, index, currentUserId));
}

/** 1P 이상일 때만 순위 반환. 0P 이하면 null */
export async function fetchMyRank(points: number): Promise<number | null> {
  if (points <= 0) return null;

  const { count, error } = await supabase
    .from("users")
    .select("id", { count: "exact", head: true })
    .not("points", "is", null)
    .gt("points", points);

  if (error) {
    console.error("fetchMyRank query error:", error);
    return null;
  }

  return (count ?? 0) + 1;
}

async function fetchUserPointsFromDb(userId: string): Promise<number | null> {
  if (!isValidAuthUserId(userId)) return null;

  const { data, error } = await supabase
    .from("users")
    .select("points")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("fetchUserPointsFromDb query error:", error);
    return null;
  }
  if (!data) return null;
  return normalizePoints(data.points);
}

export async function fetchLiveRanking(options: {
  userId?: string | null;
  /** localStorage 등 클라이언트 캐시 — DB 값과 max 로 보정 */
  points?: number;
}) {
  const userId = isValidAuthUserId(options.userId) ? options.userId.trim() : null;
  const cachedPoints = normalizePoints(options.points);

  const topFive = await fetchTopRankedUsers(userId);
  const meInTop = findMeInTopFive(topFive, userId);

  if (meInTop) {
    return {
      topFive,
      rank: meInTop.rank,
      myPoints: meInTop.points,
    };
  }

  let resolvedPoints = cachedPoints;
  let fetchedRank: number | null = null;

  if (userId) {
    const dbPoints = await fetchUserPointsFromDb(userId);
    if (dbPoints != null) {
      resolvedPoints = Math.max(cachedPoints, dbPoints);
    }
    await ensureCurrentUserPointsVisible(userId, resolvedPoints);
    fetchedRank = await fetchMyRank(resolvedPoints);
  }

  return {
    topFive,
    rank: fetchedRank,
    myPoints: resolvedPoints,
  };
}
