import { normalizeGroupId } from "@/app/data";
import { supabase } from "@/lib/supabase";

export const CHALLENGE_TOTAL_DAYS = 66;

/** true면 hasSeenCompletion_* 로컬 플래그로 모달 재노출을 막음 (기본: 테스트용 off) */
export const COMPLETION_CELEBRATION_RESPECT_SEEN =
  process.env.NEXT_PUBLIC_COMPLETION_MODAL_ONCE === "1";

export function completionSeenStorageKey(groupId: string) {
  return `hasSeenCompletion_${normalizeGroupId(groupId)}`;
}

export function hasSeenCompletionCelebration(groupId: string) {
  if (!COMPLETION_CELEBRATION_RESPECT_SEEN) return false;
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(completionSeenStorageKey(groupId)) === "1";
  } catch {
    return false;
  }
}

export function markCompletionCelebrationSeen(groupId: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(completionSeenStorageKey(groupId), "1");
  } catch {
    // ignore
  }
}

export function userVerifiedChallengeDay(
  verifiedDays: Iterable<number>,
  day: number,
): boolean {
  const target = Math.max(1, Math.floor(day));
  for (const value of verifiedDays) {
    if (Number(value) === target) return true;
  }
  return false;
}

/** Day 66(또는 total) 달성 + 해당 일차 본인 인증 완료 */
export function shouldCelebrateChallengeCompletion(input: {
  started: boolean;
  isMember: boolean;
  currentDay: number;
  totalDays: number;
  verifiedDays: Iterable<number>;
  groupId: string;
}) {
  if (!input.started || !input.isMember) return false;
  if (hasSeenCompletionCelebration(input.groupId)) return false;
  const total = Math.max(1, input.totalDays);
  if (input.currentDay < total) return false;
  return userVerifiedChallengeDay(input.verifiedDays, total);
}

export async function markGroupCompletedIfEligible(groupId: string) {
  const id = normalizeGroupId(groupId);
  if (!id) return false;

  const attempts = [{ status: "completed" }, { status: "finished" }] as const;

  for (const patch of attempts) {
    const { data, error } = await supabase
      .from("groups")
      .update(patch)
      .eq("id", id)
      .select("id, status")
      .maybeSingle();

    if (!error && data) return true;
    if (error) {
      console.warn("markGroupCompletedIfEligible failed", { groupId: id, patch, error });
    }
  }
  return false;
}
