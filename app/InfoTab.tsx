"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Article } from "@/lib/articles";

function formatSupabaseError(error: unknown) {
  if (error && typeof error === "object") {
    const typed = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [
      typed.message,
      typed.details,
      typed.hint,
      typed.code ? `code: ${typed.code}` : null,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join("\n");
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "글을 불러오지 못했습니다.";
}

function SkeletonCard() {
  return (
    <article className="rounded-2xl border border-gray-800 bg-[#1B1D22] p-4">
      <div className="flex gap-3">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-white/10" />
        <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
          <div className="h-3 w-14 animate-pulse rounded-full bg-white/10" />
          <div className="h-4 w-3/4 animate-pulse rounded-full bg-white/15" />
          <div className="h-3 w-full animate-pulse rounded-full bg-white/8" />
          <div className="h-3 w-5/6 animate-pulse rounded-full bg-white/8" />
        </div>
      </div>
    </article>
  );
}

export function InfoTab() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchArticles() {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from("articles")
        .select("*")
        .order("order_num", { ascending: true });

      if (cancelled) {
        return;
      }

      if (fetchError) {
        console.error("articles select failed", fetchError);
        setError(formatSupabaseError(fetchError));
        setArticles([]);
      } else {
        setArticles(data ?? []);
      }

      setLoading(false);
    }

    void fetchArticles();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-3 px-4 pb-28 pt-4">
      {error ? (
          <p
            role="alert"
            className="whitespace-pre-wrap rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </p>
        ) : null}

        {loading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : articles.length === 0 && !error ? (
          <div className="rounded-2xl border border-dashed border-gray-800 bg-[#1B1D22] px-5 py-14 text-center">
            <p className="font-semibold">아직 등록된 인사이트가 없습니다</p>
            <p className="mt-2 text-sm text-gray-400">
              습관에 관한 인사이트가 준비되면 여기에 표시됩니다.
            </p>
          </div>
        ) : (
          articles.map((article) => (
            <article
              key={article.id}
              className="rounded-2xl border border-gray-800 bg-[#1B1D22] p-4"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00FF87]/10 text-xl">
                  {article.icon || "📌"}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="inline-flex rounded-full bg-[#00FF87]/10 px-2.5 py-1 text-[11px] font-semibold text-[#00FF87]">
                    {article.category}
                  </span>
                  <h2 className="mt-2 font-bold leading-snug text-white">
                    {article.title}
                  </h2>
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-400">
                    {article.content}
                  </p>
                </div>
              </div>
            </article>
          ))
        )}
    </div>
  );
}
