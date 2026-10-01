/** R2 public URL (클라이언트·서버 공용, AWS SDK 없음) */

export function r2PublicUrlBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim() ||
    process.env.R2_PUBLIC_URL?.trim() ||
    "";
  return raw.replace(/\/+$/, "");
}

export function r2PublicUrlForObjectKey(objectKey: string): string {
  const base = r2PublicUrlBase();
  const key = objectKey.trim().replace(/^\/+/, "").replace(/^verifications\//, "");
  if (!base || !key) return "";
  const encoded = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${encoded}`;
}
