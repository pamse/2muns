import { normalizeGroupId } from "@/app/data";
import { supabase } from "@/lib/supabase";

/**
 * 응원 데이터는 `public.verification_cheers` 테이블에 저장합니다.
 * (마이그레이션: supabase/verification_cheers.sql)
 *
 * `verifications` 테이블에는 cheers_count / cheer_user_ids 컬럼이 없으며,
 * reactions·verification_likes 등 다른 테이블 참조는 코드베이스에 없습니다.
 */
export const VERIFICATION_CHEERS_TABLE = "verification_cheers";

const STORAGE_KEY = "muns:verification-cheers";
const REMOTE_UNAVAILABLE_KEY = "muns:cheers-remote-unavailable";

export type CheerSummary = {
  count: number;
  cheeredByMe: boolean;
  cheererIds: string[];
};

type CheersStore = Record<string, string[]>;

function readRemoteUnavailableFlag(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(REMOTE_UNAVAILABLE_KEY) === "1";
}

function persistRemoteUnavailableFlag(unavailable: boolean) {
  if (typeof window === "undefined") return;
  if (unavailable) {
    window.localStorage.setItem(REMOTE_UNAVAILABLE_KEY, "1");
  } else {
    window.localStorage.removeItem(REMOTE_UNAVAILABLE_KEY);
  }
}

let remoteCheersKnownUnavailable = readRemoteUnavailableFlag();

export function isVerificationCheersRemoteEnabled(): boolean {
  return !remoteCheersKnownUnavailable;
}

function markRemoteCheersUnavailable(reason?: unknown) {
  if (remoteCheersKnownUnavailable) return;
  remoteCheersKnownUnavailable = true;
  persistRemoteUnavailableFlag(true);
  console.warn(
    `[cheers] Supabase table public.${VERIFICATION_CHEERS_TABLE} is not available. ` +
      "Using localStorage for this device. Apply supabase/verification_cheers.sql in the SQL Editor for cross-device sync.",
    reason,
  );
}

function markRemoteCheersAvailable() {
  if (!remoteCheersKnownUnavailable) return;
  remoteCheersKnownUnavailable = false;
  persistRemoteUnavailableFlag(false);
}

export function isCheersSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: string; message?: string; details?: string; hint?: string };
  const blob = [record.message, record.details, record.hint].filter(Boolean).join(" ").toLowerCase();
  if (record.code === "PGRST205" || record.code === "42P01") return true;
  if (blob.includes("verification_cheers")) return true;
  if (blob.includes("schema cache")) return true;
  if (blob.includes("could not find the table")) return true;
  return false;
}

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

  if (remoteCheersKnownUnavailable) {
    return result;
  }

  try {
    const { data, error } = await supabase
      .from(VERIFICATION_CHEERS_TABLE)
      .select("target_user_id, cheerer_user_id")
      .eq("group_id", groupId)
      .eq("day", day);

    if (error) {
      if (isCheersSchemaMissingError(error)) {
        markRemoteCheersUnavailable(error);
      }
      return result;
    }

    markRemoteCheersAvailable();

    const grouped = new Map<string, string[]>();
    for (const row of data ?? []) {
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
  } catch (error) {
    if (isCheersSchemaMissingError(error)) {
      markRemoteCheersUnavailable(error);
    }
  }

  return result;
}

async function syncCheerInsert(input: {
  groupId: string;
  day: number;
  targetUserId: string;
  cheererUserId: string;
}): Promise<boolean> {
  if (remoteCheersKnownUnavailable) {
    return false;
  }

  const { error } = await supabase.from(VERIFICATION_CHEERS_TABLE).upsert(
    {
      group_id: input.groupId,
      target_user_id: input.targetUserId,
      cheerer_user_id: input.cheererUserId,
      day: input.day,
    },
    { onConflict: "group_id,target_user_id,cheerer_user_id,day" },
  );

  if (!error) {
    markRemoteCheersAvailable();
    return true;
  }

  if (isCheersSchemaMissingError(error)) {
    markRemoteCheersUnavailable(error);
    return false;
  }

  throw new Error(error.message || "응원 저장에 실패했습니다.");
}

async function syncCheerDelete(input: {
  groupId: string;
  day: number;
  targetUserId: string;
  cheererUserId: string;
}): Promise<boolean> {
  if (remoteCheersKnownUnavailable) {
    return false;
  }

  const { error } = await supabase
    .from(VERIFICATION_CHEERS_TABLE)
    .delete()
    .eq("group_id", input.groupId)
    .eq("day", input.day)
    .eq("target_user_id", input.targetUserId)
    .eq("cheerer_user_id", input.cheererUserId);

  if (!error) {
    markRemoteCheersAvailable();
    return true;
  }

  if (isCheersSchemaMissingError(error)) {
    markRemoteCheersUnavailable(error);
    return false;
  }

  throw new Error(error.message || "응원 취소에 실패했습니다.");
}

/** @returns true if Supabase에 반영됨, false면 이 기기 localStorage만 사용 */
export async function persistCheerToggle(input: {
  groupId: string;
  day: number;
  targetUserId: string;
  cheererUserId: string;
  added: boolean;
}): Promise<boolean> {
  if (input.added) {
    return syncCheerInsert(input);
  }
  return syncCheerDelete(input);
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
