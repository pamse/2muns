import { normalizeGroupId } from "@/app/data";
import { supabase } from "@/lib/supabase";

const STORAGE_KEY = "muns:verification-cheers";

export type CheerSummary = {
  count: number;
  cheeredByMe: boolean;
  cheererIds: string[];
};

type CheersStore = Record<string, string[]>;

function recordKey(groupId: string, day: number, targetUserId: string) {
  return `${normalizeGroupId(groupId)}:${day}:${normalizeGroupId(targetUserId)}`;
}

function readStore(): CheersStore {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CheersStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: CheersStore) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function summarize(ids: string[], viewerId?: string | null): CheerSummary {
  const cheererIds = [...new Set(ids.map((id) => normalizeGroupId(id)).filter(Boolean))];
  return {
    count: cheererIds.length,
    cheeredByMe: Boolean(viewerId && cheererIds.includes(normalizeGroupId(viewerId))),
    cheererIds,
  };
}

export function applyCheerToggleLocal(input: {
  groupId: string;
  day: number;
  targetUserId: string;
  cheererUserId: string;
}): { summary: CheerSummary; added: boolean } {
  const key = recordKey(input.groupId, input.day, input.targetUserId);
  const store = readStore();
  const current = [...new Set((store[key] ?? []).map(normalizeGroupId))];
  const cheerer = normalizeGroupId(input.cheererUserId);
  const hasCheered = current.includes(cheerer);

  const nextIds = hasCheered
    ? current.filter((id) => id !== cheerer)
    : [...current, cheerer];

  store[key] = nextIds;
  writeStore(store);

  return {
    summary: summarize(nextIds, input.cheererUserId),
    added: !hasCheered,
  };
}

export async function fetchCheersForDay(
  groupId: string,
  day: number,
  viewerId?: string | null,
): Promise<Record<string, CheerSummary>> {
  const store = readStore();
  const prefix = `${normalizeGroupId(groupId)}:${day}:`;
  const result: Record<string, CheerSummary> = {};

  for (const [key, ids] of Object.entries(store)) {
    if (!key.startsWith(prefix)) continue;
    const targetUserId = key.slice(prefix.length);
    result[targetUserId] = summarize(ids, viewerId);
  }

  try {
    const { data, error } = await supabase
      .from("verification_cheers")
      .select("target_user_id, cheerer_user_id")
      .eq("group_id", groupId)
      .eq("day", day);

    if (!error && data) {
      const grouped = new Map<string, string[]>();
      for (const row of data) {
        const target = normalizeGroupId(row.target_user_id);
        const cheerer = normalizeGroupId(row.cheerer_user_id);
        if (!target || !cheerer) continue;
        const list = grouped.get(target) ?? [];
        list.push(cheerer);
        grouped.set(target, list);
      }

      for (const [targetUserId, ids] of grouped.entries()) {
        const key = recordKey(groupId, day, targetUserId);
        store[key] = [...new Set(ids)];
        result[targetUserId] = summarize(store[key], viewerId);
      }
      writeStore(store);
    }
  } catch {
    // Supabase 미적용 시 localStorage만 사용
  }

  return result;
}

async function syncCheerInsert(input: {
  groupId: string;
  day: number;
  targetUserId: string;
  cheererUserId: string;
}) {
  const { error } = await supabase.from("verification_cheers").upsert(
    {
      group_id: input.groupId,
      target_user_id: input.targetUserId,
      cheerer_user_id: input.cheererUserId,
      day: input.day,
    },
    { onConflict: "group_id,target_user_id,cheerer_user_id,day" },
  );
  if (error) {
    throw new Error(error.message || "응원 저장에 실패했습니다.");
  }
}

async function syncCheerDelete(input: {
  groupId: string;
  day: number;
  targetUserId: string;
  cheererUserId: string;
}) {
  const { error } = await supabase
    .from("verification_cheers")
    .delete()
    .eq("group_id", input.groupId)
    .eq("day", input.day)
    .eq("target_user_id", input.targetUserId)
    .eq("cheerer_user_id", input.cheererUserId);
  if (error) {
    throw new Error(error.message || "응원 취소에 실패했습니다.");
  }
}

export async function persistCheerToggle(input: {
  groupId: string;
  day: number;
  targetUserId: string;
  cheererUserId: string;
  added: boolean;
}) {
  if (input.added) {
    await syncCheerInsert(input);
  } else {
    await syncCheerDelete(input);
  }
}

export async function toggleVerificationCheer(input: {
  groupId: string;
  day: number;
  targetUserId: string;
  cheererUserId: string;
}): Promise<CheerSummary> {
  const { summary, added } = applyCheerToggleLocal(input);
  try {
    await persistCheerToggle({ ...input, added });
  } catch (error) {
    applyCheerToggleLocal(input);
    throw error;
  }
  return summary;
}
