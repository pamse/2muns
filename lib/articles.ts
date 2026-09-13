export type { Article, ArticleInsert, ArticleUpdate } from "@/lib/database.types";

const NEW_ARTICLE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** 등록 후 24시간 이내 아티클인지 확인 */
export function isArticleNew(
  createdAt: string | null | undefined,
  now = Date.now(),
) {
  if (!createdAt) return false;
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) return false;
  return now - created >= 0 && now - created < NEW_ARTICLE_WINDOW_MS;
}
