import { supabase } from "@/lib/supabase";

let groupsCompletedAtColumn: boolean | undefined;

/** PostgREST / Postgres — `groups.completed_at` 미존재 */
export function isGroupsCompletedAtMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const rec = error as { message?: string; code?: string; details?: string };
  const blob = `${rec.message ?? ""} ${rec.details ?? ""}`.toLowerCase();
  return (
    rec.code === "PGRST204" ||
    rec.code === "42703" ||
    (blob.includes("completed_at") &&
      (blob.includes("column") ||
        blob.includes("does not exist") ||
        blob.includes("could not find")))
  );
}

/** DB에 `groups.completed_at` 컬럼이 있으면 true (결과 캐시) */
export async function groupsTableHasCompletedAtColumn(): Promise<boolean> {
  if (groupsCompletedAtColumn !== undefined) return groupsCompletedAtColumn;

  const { error } = await supabase.from("groups").select("completed_at").limit(1);
  if (!error) {
    groupsCompletedAtColumn = true;
    return true;
  }
  if (isGroupsCompletedAtMissingError(error)) {
    groupsCompletedAtColumn = false;
    return false;
  }

  groupsCompletedAtColumn = false;
  return false;
}

export async function tryUpdateGroupCompletedAt(
  groupId: string,
  completedAt: string,
): Promise<void> {
  const hasColumn = await groupsTableHasCompletedAtColumn();
  if (!hasColumn) return;

  const { error } = await supabase
    .from("groups")
    .update({ completed_at: completedAt })
    .eq("id", groupId);

  if (error && !isGroupsCompletedAtMissingError(error)) {
    console.warn("groups.completed_at update failed", { groupId, error });
  }
}
