/** 인증·숏츠 영상 MIME / Storage / 다운로드 표준 (MP4 우선) */

export const VERIFICATION_RECORD_MIME_TYPES = [
  "video/mp4;codecs=avc1",
  "video/mp4;codecs=h264",
  "video/mp4",
  "video/webm;codecs=h264",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

export const MIN_VERIFICATION_VIDEO_BYTES = 256;

export function getSupportedVerificationMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of VERIFICATION_RECORD_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return "";
}

export function pickMediaRecorderOptions(): MediaRecorderOptions | undefined {
  const mimeType = getSupportedVerificationMimeType();
  return mimeType
    ? { mimeType, videoBitsPerSecond: 1_500_000 }
    : undefined;
}

export function isMp4MimeType(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().startsWith("video/mp4");
}

export function contentTypeForBlob(blob: Blob): string {
  const type = blob.type?.trim().toLowerCase();
  if (type) return type.split(";")[0] ?? type;
  return "video/mp4";
}

export function storageExtensionForBlob(blob: Blob): "mp4" | "webm" {
  const type = contentTypeForBlob(blob);
  if (isMp4MimeType(type)) return "mp4";
  if (type.startsWith("video/webm")) return "webm";
  return "mp4";
}

export function storageExtensionForPath(path: string): "mp4" | "webm" {
  const lower = path.trim().toLowerCase();
  if (lower.endsWith(".mp4")) return "mp4";
  if (lower.endsWith(".webm")) return "webm";
  return "mp4";
}

/** `<source type>` 힌트 (경로·MIME 기준) */
export function videoSourceTypeForUrl(url: string): string {
  const lower = url.split("?")[0]?.toLowerCase() ?? "";
  if (lower.endsWith(".webm")) return "video/webm";
  return "video/mp4";
}

export function wrapBlobAsMp4Download(original: Blob): Blob {
  return new Blob([original], { type: "video/mp4" });
}

export function weekHighlightDownloadFilename(week: number): string {
  return `2muns_week${Math.max(1, Math.floor(week))}_highlight.mp4`;
}

export function weekVerificationDownloadFilename(week: number): string {
  return `2muns_week${Math.max(1, Math.floor(week))}_verification.mp4`;
}

/** Safari 캔버스 합성 실패 시 Storage 원본 MP4 저장 (비용 0원 Fallback) */
export async function downloadFallbackVerificationVideo(
  originalUrl: string,
  weekNumber: number,
): Promise<void> {
  const filename = weekVerificationDownloadFilename(weekNumber);
  try {
    const blob = await fetchVideoBlobForDownload(originalUrl);
    triggerMp4FileDownload(blob, filename);
  } catch (err) {
    console.warn("[Compositor Fallback] 원본 fetch/다운로드 실패, URL 새 창으로 열기", err);
    window.open(originalUrl, "_blank", "noopener,noreferrer");
  }
}

export async function fetchVideoBlobForDownload(videoUrl: string): Promise<Blob> {
  const res = await fetch(videoUrl, { mode: "cors" });
  if (!res.ok) {
    throw new Error("영상 파일 다운로드 실패");
  }
  const originalBlob = await res.blob();
  if (originalBlob.size < MIN_VERIFICATION_VIDEO_BYTES) {
    throw new Error(
      "다운로드한 파일이 손상되었거나 서버 오류 응답입니다. 잠시 후 다시 시도해 주세요.",
    );
  }
  return wrapBlobAsMp4Download(originalBlob);
}

export function triggerMp4FileDownload(blob: Blob, filename: string) {
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}
