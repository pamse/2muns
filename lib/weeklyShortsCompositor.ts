import {
  getSupportedVerificationMimeType,
  wrapBlobAsMp4Download,
} from "@/lib/videoFormat";

export const SHORTS_CANVAS_WIDTH = 1080;
export const SHORTS_CANVAS_HEIGHT = 1920;
export const SHORTS_CANVAS_WIDTH_MOBILE = 720;
export const SHORTS_CANVAS_HEIGHT_MOBILE = 1280;

const SEGMENT_FALLBACK_SEC = 3;
const CLIP_WALL_MS = 3000;
const CLIP_WALL_MS_FAST = 1500;
const RECORD_FPS = 30;
const FRAME_INTERVAL_MS = 1000 / RECORD_FPS;
/** 720p·15초 합성 성공 기준 (Fallback은 이보다 작을 때만) */
const MIN_HIGHLIGHT_BYTES = 200_000;
const POST_RECORD_BUFFER_MS = 500;
const RECORDER_VIDEO_BPS = 3_000_000;
const RECORDER_VIDEO_BPS_MOBILE = 2_500_000;
const RECORDER_TIMESLICE_MS = 1000;

function isIosWebKit(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const iosDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return iosDevice;
}

function isMobileCompositorEnvironment(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (isIosWebKit()) return true;
  return /Android/i.test(ua) && /Mobile/i.test(ua);
}

export function resolveShortsCanvasSize(): {
  width: number;
  height: number;
  pureVideoCapture: boolean;
  videoBitsPerSecond: number;
} {
  const mobile = isMobileCompositorEnvironment();
  return {
    width: mobile ? SHORTS_CANVAS_WIDTH_MOBILE : SHORTS_CANVAS_WIDTH,
    height: mobile ? SHORTS_CANVAS_HEIGHT_MOBILE : SHORTS_CANVAS_HEIGHT,
    pureVideoCapture: isIosWebKit(),
    videoBitsPerSecond: mobile ? RECORDER_VIDEO_BPS_MOBILE : RECORDER_VIDEO_BPS,
  };
}

let safariCanvasPulse = false;

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
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const s = W / SHORTS_CANVAS_WIDTH;

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    ctx.save();
    ctx.filter = `blur(${Math.round(32 * s)}px) brightness(0.35)`;
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

  const badgeX = 48 * s;
  const badgeY = 72 * s;
  const badgeW = 220 * s;
  const badgeH = 58 * s;
  roundRectPath(ctx, badgeX, badgeY, badgeW, badgeH, 14 * s);
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fill();
  ctx.font = `bold ${Math.round(34 * s)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = "#00FF87";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("2müns", badgeX + 22 * s, badgeY + badgeH / 2);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `800 ${Math.round(56 * s)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 12 * s;
  ctx.fillText(`DAY ${opts.day} / 66`, W / 2, H - 200 * s);
  ctx.shadowBlur = 0;

  ctx.font = `500 ${Math.round(34 * s)}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  const caption = opts.title.trim().slice(0, 20) || `DAY ${opts.day}`;
  ctx.fillText(caption, W / 2, H - 132 * s);

  const barCount = opts.weekSlots.length;
  const gap = 10 * s;
  const padX = 48 * s;
  const barH = 8 * s;
  const barY = H - 72 * s;
  const barW =
    barCount > 0 ? (W - padX * 2 - gap * (barCount - 1)) / barCount : 0;

  opts.weekSlots.forEach((slot, i) => {
    const x = padX + i * (barW + gap);
    roundRectPath(ctx, x, barY, barW, barH, 4 * s);
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
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
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

type CanvasCaptureTrack = MediaStreamTrack & { requestFrame?: () => void };

function requestCanvasFrame(canvasVideoStream: MediaStream) {
  const track = canvasVideoStream.getVideoTracks()[0] as CanvasCaptureTrack | undefined;
  track?.requestFrame?.();
}

/** iOS Safari: 픽셀 변경을 인코더에 강제 알림 */
function forceCanvasPixelPulse(ctx: CanvasRenderingContext2D) {
  safariCanvasPulse = !safariCanvasPulse;
  ctx.fillStyle = safariCanvasPulse
    ? "rgba(0,0,0,0.011)"
    : "rgba(0,0,0,0.021)";
  ctx.fillRect(0, 0, 1, 1);
}

type FrameDrawOpts = {
  day: number;
  title: string;
  weekSlots: WeeklyShortsWeekSlot[];
  activeSlotIndex: number;
};

function commitCompositorFrame(
  ctx: CanvasRenderingContext2D,
  canvasVideoStream: MediaStream,
  video: HTMLVideoElement | null,
  opts: FrameDrawOpts,
) {
  drawWeeklyShortsFrame(ctx, video, opts);
  forceCanvasPixelPulse(ctx);
  requestCanvasFrame(canvasVideoStream);
}

type CompositorStage = {
  attachVideo: (video: HTMLVideoElement) => void;
  detachVideo: () => void;
  destroy: () => void;
};

/** iOS Safari: 보이는 DOM 트리에 캔버스를 두어 captureStream 인코딩 유지 */
function createCompositorStage(
  canvas: HTMLCanvasElement,
  mountEl?: HTMLElement | null,
): CompositorStage {
  const root = document.createElement("div");
  root.setAttribute("data-weekly-shorts-compositor", "true");
  const visibleInModal = Boolean(mountEl);

  if (visibleInModal && mountEl) {
    root.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;opacity:1;pointer-events:none;overflow:hidden;z-index:20;background:#000";
    canvas.style.cssText = "display:block;width:100%;height:100%;object-fit:cover";
    root.appendChild(canvas);
    mountEl.appendChild(root);
  } else {
    root.style.cssText =
      "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0.99;pointer-events:none;z-index:9999;overflow:hidden;background:#000";
    canvas.style.display = "block";
    canvas.style.width = `${canvas.width}px`;
    canvas.style.height = `${canvas.height}px`;
    root.appendChild(canvas);
    document.body.appendChild(root);
  }

  let activeVideo: HTMLVideoElement | null = null;
  const videoStyle = visibleInModal
    ? "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:1"
    : "position:absolute;left:0;top:0;width:1px;height:1px;object-fit:cover;opacity:0.99";

  return {
    attachVideo(video: HTMLVideoElement) {
      this.detachVideo();
      video.volume = 0;
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.style.cssText = videoStyle;
      root.appendChild(video);
      activeVideo = video;
    },
    detachVideo() {
      if (activeVideo) {
        activeVideo.remove();
        activeVideo = null;
      }
    },
    destroy() {
      this.detachVideo();
      root.remove();
    },
  };
}

type CompositorMediaStreams = {
  recorderStream: MediaStream;
  canvasVideoStream: MediaStream;
  resumeAudio: () => Promise<void>;
  cleanup: () => void;
};

/** iOS Safari: 순수 canvas.captureStream만 사용 (무음 오디오 병합 시 A/V 락 방지) */
function createCompositorMediaStreams(
  canvas: HTMLCanvasElement,
  pureVideoOnly: boolean,
): CompositorMediaStreams {
  const canvasVideoStream = canvas.captureStream(RECORD_FPS);

  if (pureVideoOnly) {
    const cleanup = () => {
      canvasVideoStream.getTracks().forEach((t) => t.stop());
    };
    return {
      recorderStream: canvasVideoStream,
      canvasVideoStream,
      resumeAudio: async () => {},
      cleanup,
    };
  }

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    const cleanup = () => {
      canvasVideoStream.getTracks().forEach((t) => t.stop());
    };
    return {
      recorderStream: canvasVideoStream,
      canvasVideoStream,
      resumeAudio: async () => {},
      cleanup,
    };
  }

  const audioCtx = new AudioCtx();
  const oscillator = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  gain.gain.value = 0;
  oscillator.connect(gain);
  const silentDest = audioCtx.createMediaStreamDestination();
  gain.connect(silentDest);
  oscillator.start(0);

  const recorderStream = new MediaStream([
    ...canvasVideoStream.getVideoTracks(),
    ...silentDest.stream.getAudioTracks(),
  ]);

  const cleanup = () => {
    try {
      oscillator.stop();
    } catch {
      // ignore
    }
    void audioCtx.close().catch(() => {});
    canvasVideoStream.getTracks().forEach((t) => t.stop());
    silentDest.stream.getTracks().forEach((t) => t.stop());
    recorderStream.getTracks().forEach((t) => t.stop());
  };

  return {
    recorderStream,
    canvasVideoStream,
    resumeAudio: () => audioCtx.resume(),
    cleanup,
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

function clipWallDurationMs(doubleSpeed: boolean): number {
  return doubleSpeed ? CLIP_WALL_MS_FAST : CLIP_WALL_MS;
}

/**
 * 클립당 wall-clock 최소 시간을 보장하며 캔버스에 그림 (Safari 조기 종료 방지).
 */
async function playAndDrawClip(
  ctx: CanvasRenderingContext2D,
  canvasVideoStream: MediaStream,
  video: HTMLVideoElement,
  segment: WeeklyShortsRenderClip,
  weekSlots: WeeklyShortsWeekSlot[],
  activeSlotIndex: number,
  doubleSpeed: boolean,
  debugLog?: (message: string) => void,
): Promise<void> {
  const durationSec =
    Number.isFinite(video.duration) && video.duration > 0
      ? Math.min(video.duration, 15)
      : SEGMENT_FALLBACK_SEC;

  video.playbackRate = doubleSpeed ? 2 : 1;
  const wallMs = clipWallDurationMs(doubleSpeed);

  await seekVideoTo(video, 0);
  try {
    await video.play();
  } catch {
    // 재생 차단 시 seek + wall-clock 루프로 대체
  }

  const drawOpts: FrameDrawOpts = {
    day: segment.day,
    title: segment.title,
    weekSlots,
    activeSlotIndex,
  };

  const wallStart = performance.now();
  let lastSeekTime = -1;
  let drawFrameLogged = false;

  while (performance.now() - wallStart < wallMs) {
    const elapsed = performance.now() - wallStart;
    const progress = Math.min(1, elapsed / wallMs);
    const targetMediaTime = Math.min(
      progress * durationSec,
      Math.max(0, durationSec - 0.05),
    );

    if (video.paused || video.currentTime < targetMediaTime - 0.12) {
      if (Math.abs(lastSeekTime - targetMediaTime) > 0.03) {
        await seekVideoTo(video, targetMediaTime);
        lastSeekTime = targetMediaTime;
      }
    }

    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    commitCompositorFrame(ctx, canvasVideoStream, video, drawOpts);
    if (!drawFrameLogged) {
      drawFrameLogged = true;
      const drawOk = video.readyState >= 2 && video.videoWidth > 0;
      debugLog?.(
        `클립 DAY ${segment.day} drawImage ${drawOk ? "성공" : "실패"} ` +
          `(readyState=${video.readyState}, ${video.videoWidth}x${video.videoHeight}, t=${video.currentTime.toFixed(2)}s)`,
      );
    }
    await delay(FRAME_INTERVAL_MS);
  }
}

async function playSegmentOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvasVideoStream: MediaStream,
  stage: CompositorStage,
  segment: WeeklyShortsRenderClip,
  weekSlots: WeeklyShortsWeekSlot[],
  activeSlotIndex: number,
  doubleSpeed: boolean,
  clipIndex: number,
  debugLog?: (message: string) => void,
): Promise<void> {
  let video: HTMLVideoElement;
  try {
    video = await loadVideoElement(segment.videoUrl, segment.day);
    debugLog?.(
      `클립 ${clipIndex + 1} (DAY ${segment.day}) 로드 성공 ${video.videoWidth}x${video.videoHeight}`,
    );
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown";
    debugLog?.(`클립 ${clipIndex + 1} (DAY ${segment.day}) 로드 실패: ${detail}`);
    throw err;
  }
  stage.attachVideo(video);

  try {
    await playAndDrawClip(
      ctx,
      canvasVideoStream,
      video,
      segment,
      weekSlots,
      activeSlotIndex,
      doubleSpeed,
      debugLog,
    );
  } finally {
    video.pause();
    video.removeAttribute("src");
    video.load();
    stage.detachVideo();
  }
}

export type WeeklyShortsHighlightResult =
  | { mode: "composited"; blob: Blob }
  | { mode: "canvas_buffer_too_small"; recordedBytes: number };

export async function renderWeeklyShortsHighlightVideo(input: {
  segments: WeeklyShortsRenderClip[];
  weekSlots: WeeklyShortsWeekSlot[];
  doubleSpeed: boolean;
  onProgress?: (message: string) => void;
  onDebugLog?: (line: string) => void;
  /** 모달 미리보기 영역 — Safari용 가시 캔버스 마운트 */
  compositorMountEl?: HTMLElement | null;
}): Promise<WeeklyShortsHighlightResult> {
  const { segments, weekSlots, doubleSpeed, onProgress, onDebugLog, compositorMountEl } =
    input;
  let debugStep = 0;
  const logDebug = (message: string) => {
    debugStep += 1;
    const line = `[${debugStep}] ${message}`;
    console.info("[WeeklyShortsCompositor]", line);
    onDebugLog?.(line);
  };
  if (segments.length === 0) {
    throw new Error("합성할 인증 영상이 없습니다.");
  }
  if (typeof document === "undefined" || typeof MediaRecorder === "undefined") {
    throw new Error("이 브라우저에서는 숏츠 영상 합성을 지원하지 않습니다.");
  }

  const canvasSize = resolveShortsCanvasSize();
  const canvas = document.createElement("canvas");
  canvas.width = canvasSize.width;
  canvas.height = canvasSize.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas를 초기화하지 못했습니다.");
  }

  logDebug(
    `캔버스 초기화 완료: ${canvas.width}x${canvas.height} ` +
      `(pureVideo=${canvasSize.pureVideoCapture}, mount=${Boolean(compositorMountEl)})`,
  );

  const stage = createCompositorStage(canvas, compositorMountEl);

  const mimeType = pickCanvasRecorderMimeType();
  if (!mimeType) {
    throw new Error("영상 녹화 코덱을 찾지 못했습니다.");
  }

  const {
    recorderStream,
    canvasVideoStream,
    resumeAudio,
    cleanup: cleanupStreams,
  } = createCompositorMediaStreams(canvas, canvasSize.pureVideoCapture);

  await resumeAudio();

  const recorderOptions: MediaRecorderOptions = {
    mimeType,
    videoBitsPerSecond: canvasSize.videoBitsPerSecond,
    ...(canvasSize.pureVideoCapture ? {} : { audioBitsPerSecond: 128_000 }),
  };

  const chunks: Blob[] = [];
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(recorderStream, recorderOptions);
    logDebug(`MediaRecorder 생성 성공 mimeType=${mimeType}`);
  } catch (recErr) {
    logDebug(
      `MediaRecorder 1차 생성 실패, video-only 재시도: ${
        recErr instanceof Error ? recErr.message : "unknown"
      }`,
    );
    recorder = new MediaRecorder(recorderStream, {
      mimeType,
      videoBitsPerSecond: canvasSize.videoBitsPerSecond,
    });
    logDebug(`MediaRecorder fallback 생성 mimeType=${mimeType}`);
  }

  const recorded = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const type = mimeType.split(";")[0] || "video/webm";
      resolve(new Blob(chunks, { type }));
    };
    recorder.onerror = () => {
      logDebug("MediaRecorder onerror 발생");
      reject(new Error("숏츠 녹화 중 오류가 발생했습니다."));
    };
  });

  let firstChunkLogged = false;
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
    if (!firstChunkLogged && event.data.size > 0) {
      firstChunkLogged = true;
      logDebug(`첫 recorder chunk ${Math.round(event.data.size / 1024)}KB`);
    }
  };

  recorder.start(RECORDER_TIMESLICE_MS);
  logDebug(
    `MediaRecorder state=${recorder.state} timeslice=${RECORDER_TIMESLICE_MS}ms bps=${canvasSize.videoBitsPerSecond}`,
  );
  onProgress?.("숏츠 영상 제작 중...");

  const warmupOpts: FrameDrawOpts = {
    day: segments[0]?.day ?? 1,
    title: segments[0]?.title ?? "",
    weekSlots,
    activeSlotIndex: 0,
  };
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });
    commitCompositorFrame(ctx, canvasVideoStream, null, warmupOpts);
    await delay(FRAME_INTERVAL_MS);
  }

  try {
    for (let clipIndex = 0; clipIndex < segments.length; clipIndex += 1) {
      const segment = segments[clipIndex]!;
      const activeSlotIndex = Math.max(
        0,
        weekSlots.findIndex((s) => s.day === segment.day),
      );
      onProgress?.(`DAY ${segment.day} 합성 중...`);
      await playSegmentOnCanvas(
        ctx,
        canvasVideoStream,
        stage,
        segment,
        weekSlots,
        activeSlotIndex,
        doubleSpeed,
        clipIndex,
        logDebug,
      );
    }

    commitCompositorFrame(ctx, canvasVideoStream, null, {
      day: segments[segments.length - 1]?.day ?? 1,
      title: segments[segments.length - 1]?.title ?? "",
      weekSlots,
      activeSlotIndex: weekSlots.length - 1,
    });
    await delay(POST_RECORD_BUFFER_MS);
  } finally {
    if (recorder.state === "recording") {
      try {
        recorder.requestData();
      } catch {
        // Safari 구버전
      }
      await delay(150);
      recorder.stop();
    }
    cleanupStreams();
    stage.destroy();
  }

  const raw = await recorded;
  const chunkBytes = chunks.reduce((sum, c) => sum + c.size, 0);
  logDebug(
    `생성된 Blob 크기: ${Math.round(raw.size / 1024)}KB (chunks=${chunks.length}, ` +
      `chunkSum=${Math.round(chunkBytes / 1024)}KB, min=${Math.round(MIN_HIGHLIGHT_BYTES / 1024)}KB)`,
  );

  if (raw.size < MIN_HIGHLIGHT_BYTES) {
    logDebug("버퍼 부족 — Fallback 기준 미달");
    return { mode: "canvas_buffer_too_small", recordedBytes: raw.size };
  }

  logDebug("합성 성공 — Blob 다운로드 준비");
  return { mode: "composited", blob: wrapBlobAsMp4Download(raw) };
}
