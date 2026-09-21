import {
  getSupportedVerificationMimeType,
  wrapBlobAsMp4Download,
} from "@/lib/videoFormat";

export const SHORTS_CANVAS_WIDTH = 1080;
export const SHORTS_CANVAS_HEIGHT = 1920;

const SEGMENT_FALLBACK_SEC = 3;
const RECORD_FPS = 30;
const MIN_HIGHLIGHT_BYTES = 20_000;

export type WeeklyShortsRenderClip = {
  day: number;
  title: string;
  videoUrl: string;
};

export type WeeklyShortsWeekSlot = {
  day: number;
  hasVideo: boolean;
};

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function drawCoverVideo(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(dw / vw, dh / vh);
  const sw = vw * scale;
  const sh = vh * scale;
  const sx = dx + (dw - sw) / 2;
  const sy = dy + (dh - sh) / 2;
  ctx.drawImage(video, sx, sy, sw, sh);
}

export function drawWeeklyShortsFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  opts: {
    day: number;
    title: string;
    weekSlots: WeeklyShortsWeekSlot[];
    activeSlotIndex: number;
  },
) {
  const W = SHORTS_CANVAS_WIDTH;
  const H = SHORTS_CANVAS_HEIGHT;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    ctx.save();
    ctx.filter = "blur(32px) brightness(0.35)";
    drawCoverVideo(ctx, video, 0, 0, W, H);
    ctx.restore();
    drawCoverVideo(ctx, video, 0, 0, W, H);
  }

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(0,0,0,0.45)");
  grad.addColorStop(0.38, "rgba(0,0,0,0)");
  grad.addColorStop(0.62, "rgba(0,0,0,0)");
  grad.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const badgeX = 48;
  const badgeY = 72;
  const badgeW = 220;
  const badgeH = 58;
  roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 14);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();
  ctx.font = "bold 34px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#00FF87";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("2müns", badgeX + 22, badgeY + badgeH / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = "800 56px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 12;
  ctx.fillText(`DAY ${opts.day} / 66`, W / 2, H - 200);
  ctx.shadowBlur = 0;

  ctx.font = "500 34px system-ui, -apple-system, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  const caption = opts.title.trim().slice(0, 20) || `DAY ${opts.day}`;
  ctx.fillText(caption, W / 2, H - 132);

  const barCount = opts.weekSlots.length;
  const gap = 10;
  const padX = 48;
  const barH = 8;
  const barY = H - 72;
  const barW =
    barCount > 0 ? (W - padX * 2 - gap * (barCount - 1)) / barCount : 0;

  opts.weekSlots.forEach((slot, i) => {
    const x = padX + i * (barW + gap);
    roundRectPath(ctx, x, barY, barW, barH, 4);
    if (i === opts.activeSlotIndex) {
      ctx.fillStyle = "#00FF87";
    } else if (slot.hasVideo) {
      ctx.fillStyle = "rgba(255,255,255,0.45)";
    } else {
      ctx.fillStyle = "rgba(255,255,255,0.22)";
    }
    ctx.fill();
  });

  ctx.textAlign = "left";
}

function pickCanvasRecorderMimeType(): string {
  const types = [
    "video/mp4;codecs=avc1",
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return getSupportedVerificationMimeType();
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** iOS Safari: 오프스크린 DOM 부착 시 decode/seek 안정화 */
function mountOffscreenVideo(video: HTMLVideoElement): () => void {
  const container = document.createElement("div");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText =
    "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;overflow:hidden;pointer-events:none;z-index:-1";
  container.appendChild(video);
  document.body.appendChild(container);
  return () => {
    container.remove();
  };
}

function createCompositorVideoElement(videoUrl: string): HTMLVideoElement {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.preload = "auto";
  video.src = videoUrl;
  return video;
}

async function waitForVideoReady(
  video: HTMLVideoElement,
  timeoutMs = 20_000,
): Promise<void> {
  const ready = () =>
    video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0;

  if (ready()) return;

  await new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error("영상 버퍼링 시간이 초과되었습니다."));
    }, timeoutMs);

    const tryResolve = () => {
      if (ready()) {
        cleanup();
        resolve();
      }
    };

    const onFail = () => {
      cleanup();
      reject(new Error("영상 디코딩에 실패했습니다."));
    };

    const cleanup = () => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", tryResolve);
      video.removeEventListener("canplay", tryResolve);
      video.removeEventListener("canplaythrough", tryResolve);
      video.removeEventListener("loadedmetadata", tryResolve);
      video.removeEventListener("error", onFail);
    };

    video.addEventListener("loadeddata", tryResolve);
    video.addEventListener("canplay", tryResolve);
    video.addEventListener("canplaythrough", tryResolve);
    video.addEventListener("loadedmetadata", tryResolve);
    video.addEventListener("error", onFail);
    video.load();
    tryResolve();
  });
}

function loadVideoElement(url: string, day: number): Promise<HTMLVideoElement> {
  const video = createCompositorVideoElement(url);
  return waitForVideoReady(video).then(
    () => video,
    (err) => {
      throw err instanceof Error
        ? new Error(`DAY ${day}: ${err.message}`)
        : new Error(`DAY ${day} 영상을 불러오지 못했습니다.`);
    },
  );
}

async function seekVideoTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  const target = Math.max(0, timeSec);
  if (Math.abs(video.currentTime - target) < 0.025) return;

  await new Promise<void>((resolve) => {
    let timer = 0;
    const finish = () => {
      video.removeEventListener("seeked", finish);
      if (timer) window.clearTimeout(timer);
      resolve();
    };
    timer = window.setTimeout(finish, 900);
    video.addEventListener("seeked", finish, { once: true });
    try {
      video.currentTime = target;
    } catch {
      finish();
    }
  });
}

type CanvasCaptureTrack = MediaStreamTrack & { requestFrame?: () => void };

function requestCanvasFrame(stream: MediaStream) {
  const track = stream.getVideoTracks()[0] as CanvasCaptureTrack | undefined;
  track?.requestFrame?.();
}

async function isPlaybackAdvancing(video: HTMLVideoElement): Promise<boolean> {
  try {
    await video.play();
  } catch {
    return false;
  }
  if (video.paused) return false;
  const t0 = video.currentTime;
  await delay(180);
  return video.currentTime > t0 + 0.02;
}

async function renderSegmentFrames(
  ctx: CanvasRenderingContext2D,
  stream: MediaStream,
  video: HTMLVideoElement,
  segment: WeeklyShortsRenderClip,
  weekSlots: WeeklyShortsWeekSlot[],
  activeSlotIndex: number,
  doubleSpeed: boolean,
): Promise<void> {
  const durationSec =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(video.duration, 15)
      : SEGMENT_FALLBACK_SEC;
  video.playbackRate = doubleSpeed ? 2 : 1;
  const effectiveDuration = durationSec / video.playbackRate;
  const frameIntervalMs = 1000 / RECORD_FPS;
  const totalFrames = Math.max(
    RECORD_FPS,
    Math.ceil(effectiveDuration * RECORD_FPS),
  );

  const drawOpts = {
    day: segment.day,
    title: segment.title,
    weekSlots,
    activeSlotIndex,
  };

  const advancing = await isPlaybackAdvancing(video);

  if (advancing) {
    const started = performance.now();
    const maxMs = effectiveDuration * 1000 + 600;
    while (performance.now() - started < maxMs) {
      drawWeeklyShortsFrame(ctx, video, drawOpts);
      requestCanvasFrame(stream);
      if (
        video.ended ||
        (Number.isFinite(video.duration) &&
          video.currentTime >= durationSec - 0.06)
      ) {
        break;
      }
      await delay(frameIntervalMs);
    }
    return;
  }

  video.pause();
  for (let frame = 0; frame < totalFrames; frame += 1) {
    const mediaTime = Math.min(
      (frame / RECORD_FPS) * video.playbackRate,
      Math.max(0, durationSec - 0.04),
    );
    await seekVideoTo(video, mediaTime);
    drawWeeklyShortsFrame(ctx, video, drawOpts);
    requestCanvasFrame(stream);
    await delay(frameIntervalMs);
  }
}

async function playSegmentOnCanvas(
  ctx: CanvasRenderingContext2D,
  stream: MediaStream,
  segment: WeeklyShortsRenderClip,
  weekSlots: WeeklyShortsWeekSlot[],
  activeSlotIndex: number,
  doubleSpeed: boolean,
): Promise<void> {
  const video = await loadVideoElement(segment.videoUrl, segment.day);
  const unmount = mountOffscreenVideo(video);

  try {
    await renderSegmentFrames(
      ctx,
      stream,
      video,
      segment,
      weekSlots,
      activeSlotIndex,
      doubleSpeed,
    );
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    unmount();
  }
}

export async function renderWeeklyShortsHighlightVideo(input: {
  segments: WeeklyShortsRenderClip[];
  weekSlots: WeeklyShortsWeekSlot[];
  doubleSpeed: boolean;
  onProgress?: (message: string) => void;
}): Promise<Blob> {
  const { segments, weekSlots, doubleSpeed, onProgress } = input;
  if (segments.length === 0) {
    throw new Error("합성할 인증 영상이 없습니다.");
  }
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("이 브라우저에서는 숏츠 영상 합성을 지원하지 않습니다.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = SHORTS_CANVAS_WIDTH;
  canvas.height = SHORTS_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas를 초기화하지 못했습니다.");
  }

  const mimeType = pickCanvasRecorderMimeType();
  if (!mimeType) {
    throw new Error("영상 녹화 코덱을 찾지 못했습니다.");
  }

  const stream = canvas.captureStream(RECORD_FPS);
  const chunks: Blob[] = [];

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 2_500_000,
  });

  const recorded = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const type = mimeType.split(";")[0] || "video/webm";
      resolve(new Blob(chunks, { type }));
    };
    recorder.onerror = () => reject(new Error("숏츠 녹화 중 오류가 발생했습니다."));
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  recorder.start(250);
  onProgress?.("숏츠 영상 제작 중...");

  const warmupOpts = {
    day: segments[0]?.day ?? 1,
    title: segments[0]?.title ?? "",
    weekSlots,
    activeSlotIndex: 0,
  };
  for (let i = 0; i < 8; i += 1) {
    drawWeeklyShortsFrame(ctx, null, warmupOpts);
    requestCanvasFrame(stream);
    await delay(1000 / RECORD_FPS);
  }

  try {
    for (const segment of segments) {
      const activeSlotIndex = Math.max(
        0,
        weekSlots.findIndex((s) => s.day === segment.day),
      );
      onProgress?.(`DAY ${segment.day} 합성 중...`);
      await playSegmentOnCanvas(
        ctx,
        stream,
        segment,
        weekSlots,
        activeSlotIndex,
        doubleSpeed,
      );
    }

    drawWeeklyShortsFrame(ctx, null, {
      day: segments[segments.length - 1]?.day ?? 1,
      title: segments[segments.length - 1]?.title ?? "",
      weekSlots,
      activeSlotIndex: weekSlots.length - 1,
    });
    requestCanvasFrame(stream);
    await delay(400);
  } finally {
    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    stream.getTracks().forEach((t) => t.stop());
  }

  const raw = await recorded;
  if (raw.size < MIN_HIGHLIGHT_BYTES) {
    throw new Error(
      "합성된 영상이 너무 작습니다(모바일 재생 실패). Wi-Fi 환경에서 다시 시도해 주세요.",
    );
  }

  return wrapBlobAsMp4Download(raw);
}
