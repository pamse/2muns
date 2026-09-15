import { clearPersistedJoinedIds } from "@/lib/groups";
import { clearUserPointsCache } from "@/lib/points";
import { logoutLocalSession } from "@/app/useNickname";
import { supabase } from "@/lib/supabase";

/** 회원 탈퇴: 서버 데이터 삭제 후 로컬 세션 초기화 */
export async function withdrawUserAccount(userId: string) {
  if (!userId.trim()) {
    await logoutLocalSession();
    return;
  }

  const id = userId.trim();

  const tasks = [
    supabase.from("group_members").delete().eq("user_id", id),
    supabase.from("verifications").delete().eq("user_id", id),
    supabase
      .from("verification_cheers")
      .delete()
      .or(`cheerer_user_id.eq.${id},target_user_id.eq.${id}`),
    supabase.from("blocks").delete().or(`blocker_id.eq.${id},blocked_id.eq.${id}`),
    supabase.from("notices").delete().eq("user_id", id),
    supabase.from("user_group_bonuses").delete().eq("user_id", id),
    supabase.from("groups").update({ status: "deleted" }).eq("owner_id", id),
    supabase.from("users").delete().eq("id", id),
  ];

  for (const task of tasks) {
    try {
      const { error } = await task;
      if (error) {
        console.error("account withdrawal step failed", error);
      }
    } catch (error) {
      console.error("account withdrawal step failed", error);
    }
  }

  clearUserPointsCache(id);
  clearPersistedJoinedIds(id);
  await logoutLocalSession();
}
