"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isArticleNew, type Article } from "@/lib/articles";

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

function ArticleNewBadge() {
  return (
    <span className="inline-flex rounded-full bg-[#ff6f00] px-2 py-0.5 text-[10px] font-bold text-white">
      NEW
    </span>
  );
}

function ArticleCategoryBadges({
  category,
  createdAt,
}: {
  category: string;
  createdAt: string;
}) {
  const isNew = isArticleNew(createdAt);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex rounded-full bg-[#00FF87]/10 px-2.5 py-1 text-[11px] font-semibold text-[#00FF87]">
        {category}
      </span>
      {isNew ? <ArticleNewBadge /> : null}
    </div>
  );
}

function SkeletonCard() {
  return (
    <article className="rounded-2xl border border-zinc-800 bg-[#1B1D22] p-4">
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

function ArticleDetailModal({
  article,
  onClose,
}: {
  article: Article;
  onClose: () => void;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setHost(document.getElementById("muns-frame") ?? document.body);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  if (!host) return null;

  return createPortal(
    <div className="absolute inset-0 z-[80] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/65 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="insight-detail-title"
        className="relative z-10 flex w-full max-w-[420px] max-h-[85vh] flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-[0_20px_48px_rgba(0,0,0,0.5)]"
        style={{ animation: "entryDeniedIn 0.22s ease-out" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00FF87]/10 text-xl">
              {article.icon || "📌"}
            </div>
            <div className="mt-1.5">
              <ArticleCategoryBadges
                category={article.category}
                createdAt={article.created_at}
              />
            </div>
          </div>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4" style={{ maxHeight: "70vh" }}>
          <h2
            id="insight-detail-title"
            className="text-lg font-bold leading-snug text-white"
          >
            {article.title}
          </h2>
          <p className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-gray-300">
            {article.content}
          </p>
        </div>

        <div className="shrink-0 border-t border-zinc-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[#00FF87] py-3.5 text-sm font-bold text-black transition-transform active:scale-[0.98]"
          >
            닫기
          </button>
        </div>
      </div>
      <style>{`@keyframes entryDeniedIn{from{opacity:0;transform:scale(.96) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>,
    host,
  );
}

function ArticleCard({
  article,
  onOpen,
}: {
  article: Article;
  onOpen: (article: Article) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(article)}
      className="w-full rounded-2xl border border-zinc-800 bg-[#1B1D22] p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-900/80 active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#00FF87]/10 text-xl">
          {article.icon || "📌"}
        </div>
        <div className="min-w-0 flex-1">
          <ArticleCategoryBadges
            category={article.category}
            createdAt={article.created_at}
          />
          <h2 className="mt-2 line-clamp-1 font-bold leading-snug text-white">
            {article.title}
          </h2>
          <p className="mt-1.5 line-clamp-3 text-[13px] leading-relaxed text-gray-400">
            {article.content}
          </p>
        </div>
      </div>
    </button>
  );
}

export function InfoTab() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

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
          <ArticleCard
            key={article.id}
            article={article}
            onOpen={setSelectedArticle}
          />
        ))
      )}

      {selectedArticle ? (
        <ArticleDetailModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      ) : null}
    </div>
  );
}
