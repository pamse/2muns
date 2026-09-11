"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { AlertTriangle, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { Notice } from "@/lib/database.types";
import { BottomSheet, Pill } from "./ui";

function dismissedStorageKey(userId: string | null) {
  return `muns:dismissed-notices:${userId?.trim() || "anon"}`;
}

function readDismissedIds(userId: string | null): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(dismissedStorageKey(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];
  } catch {
    return [];
  }
}

function persistDismissedId(userId: string | null, noticeId: string) {
  if (typeof window === "undefined") return;
  const next = [...new Set([...readDismissedIds(userId), noticeId])];
  window.localStorage.setItem(dismissedStorageKey(userId), JSON.stringify(next));
}

function withoutDismissed(rows: Notice[], userId: string | null) {
  const dismissed = new Set(readDismissedIds(userId));
  if (dismissed.size === 0) return rows;
  return rows.filter((notice) => !dismissed.has(notice.id));
}

function formatNoticeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isWarningNotice(notice: Notice) {
  return notice.tag?.trim() === "경고";
}

function NoticeSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-800 bg-[#121316] p-3.5">
      <div className="flex items-center gap-2">
        <div className="h-5 w-12 animate-pulse rounded-full bg-white/10" />
        <div className="h-3 w-20 animate-pulse rounded-full bg-white/8" />
      </div>
      <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded-full bg-white/15" />
      <div className="mt-2 h-3 w-full animate-pulse rounded-full bg-white/8" />
      <div className="mt-1.5 h-3 w-5/6 animate-pulse rounded-full bg-white/8" />
    </div>
  );
}

export function useActiveNotices(myUserId: string | null, ready = true) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const fetchNotices = useCallback(
    async (silent = false) => {
      if (!ready) {
        return;
      }

      if (!silent) {
        setLoading(true);
        setError(null);
      }

      try {
        const userId = myUserId?.trim() || null;
        let query = supabase
          .from("notices")
          .select("*")
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        query = userId
          ? query.or(`user_id.is.null,user_id.eq.${userId}`)
          : query.is("user_id", null);

        const { data, error: fetchError } = await query;

        if (!aliveRef.current) {
          return;
        }

        if (fetchError) {
          console.error(
            "notices select failed",
            JSON.stringify(fetchError, null, 2),
            fetchError.message,
          );
          setError(fetchError.message);
          setNotices([]);
        } else {
          const rows = (data ?? []) as Notice[];
          setNotices(
            withoutDismissed(
              rows.filter(
                (notice) =>
                  notice.user_id == null ||
                  (userId != null && notice.user_id === userId),
              ),
              userId,
            ),
          );
          setError(null);
        }
      } catch (error) {
        if (!aliveRef.current) {
          return;
        }
        const message =
          error instanceof Error ? error.message : String(error);
        try {
          console.error(
            "notices select failed",
            JSON.stringify(error, null, 2),
            message,
          );
        } catch {
          console.error("notices select failed", error, message);
        }
        setError(message);
        setNotices([]);
      } finally {
        if (aliveRef.current && !silent) {
          setLoading(false);
        }
      }
    },
    [myUserId, ready],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }
    void fetchNotices(false);
  }, [fetchNotices, ready]);

  const prependNotice = useCallback((notice: Notice) => {
    setNotices((prev) => {
      if (readDismissedIds(myUserId).includes(notice.id)) {
        return prev;
      }
      if (
        prev.some(
          (item) =>
            item.id === notice.id ||
            (item.title === notice.title &&
              item.content === notice.content &&
              item.user_id === notice.user_id),
        )
      ) {
        return prev;
      }
      return [notice, ...prev];
    });
  }, [myUserId]);

  const removeNotice = useCallback(
    async (notice: Notice) => {
      setNotices((prev) => prev.filter((item) => item.id !== notice.id));
      persistDismissedId(myUserId, notice.id);

      const canDeleteRemote =
        Boolean(notice.id) && myUserId != null && notice.user_id === myUserId;
      if (!canDeleteRemote) return;

      const { error: deleteError } = await supabase
        .from("notices")
        .delete()
        .eq("id", notice.id);

      if (!deleteError) return;

      const { error: updateError } = await supabase
        .from("notices")
        .update({ is_active: false })
        .eq("id", notice.id);

      if (updateError) {
        console.error("notice delete failed", deleteError, updateError);
      }
    },
    [myUserId],
  );

  useEffect(() => {
    if (!ready) {
      return;
    }
    const userId = myUserId?.trim();
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`notices-user-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notices",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Notice | undefined;
          if (!row?.id || row.is_active === false) {
            return;
          }
          prependNotice(row);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notices",
        },
        (payload) => {
          const row = payload.old as { id?: string } | undefined;
          if (!row?.id) return;
          setNotices((prev) => prev.filter((item) => item.id !== row.id));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notices",
        },
        (payload) => {
          const row = payload.new as Notice | undefined;
          if (!row?.id) return;
          if (row.is_active === false) {
            setNotices((prev) => prev.filter((item) => item.id !== row.id));
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myUserId, ready, prependNotice]);

  return { notices, loading, error, refresh: fetchNotices, prependNotice, removeNotice };
}

export function NoticesSheet({
  open,
  onClose,
  notices,
  loading,
  error,
  onDeleteNotice,
}: {
  open: boolean;
  onClose: () => void;
  notices: Notice[];
  loading: boolean;
  error: string | null;
  onDeleteNotice?: (notice: Notice) => void | Promise<void>;
}) {
  function handleDelete(event: MouseEvent<HTMLButtonElement>, notice: Notice) {
    event.preventDefault();
    event.stopPropagation();
    void onDeleteNotice?.(notice);
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="알림">
      {error ? (
        <p
          role="alert"
          className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : loading ? (
        <div className="space-y-2.5">
          <NoticeSkeleton />
          <NoticeSkeleton />
        </div>
      ) : notices.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          새로운 공지사항이 없습니다.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {notices.map((notice) => {
            const warning = isWarningNotice(notice);
            return (
              <li
                key={notice.id}
                className={
                  warning
                    ? "relative rounded-2xl border border-orange-500/45 bg-orange-500/10 p-3.5 pr-10 shadow-[inset_3px_0_0_0_#f97316]"
                    : "relative rounded-2xl border border-gray-800 bg-[#121316] p-3.5 pr-10"
                }
              >
                <button
                  type="button"
                  aria-label="알림 삭제"
                  onClick={(event) => handleDelete(event, notice)}
                  className="absolute right-2.5 top-2.5 rounded-full p-1 text-zinc-500 transition-colors hover:bg-white/5 hover:text-white"
                >
                  <X className="w-4 h-4 text-zinc-500 hover:text-white" />
                </button>
                <div className="flex items-center gap-2 pr-1">
                  {notice.tag ? (
                    <Pill tone={warning ? "danger" : "accent"}>
                      {warning ? <AlertTriangle size={11} strokeWidth={2.4} /> : null}
                      {notice.tag}
                    </Pill>
                  ) : null}
                  <span className="text-[11px] text-gray-500">
                    {formatNoticeDate(notice.created_at)}
                  </span>
                </div>
                <h3
                  className={`mt-2 text-sm font-bold leading-snug ${
                    warning ? "text-orange-100" : "text-white"
                  }`}
                >
                  {notice.title}
                </h3>
                <p
                  className={`mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed ${
                    warning ? "text-orange-100/75" : "text-gray-400"
                  }`}
                >
                  {notice.content}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </BottomSheet>
  );
}
