import { supabase } from "@/lib/supabase";

/** 다른 유저가 동일 닉네임을 쓰는지 확인 (본인 id 제외) */
export async function isNicknameTaken(
  nickname: string,
  excludeUserId?: string | null,
): Promise<boolean> {
  const trimmed = nickname.trim();
  if (!trimmed) return false;

  let query = supabase.from("users").select("id").eq("nickname", trimmed).limit(1);

  if (excludeUserId) {
    query = query.neq("id", excludeUserId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("nickname availability check failed", error);
    return false;
  }

  return (data?.length ?? 0) > 0;
}
