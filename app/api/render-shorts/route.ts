import { existsSync } from "fs";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";

export const maxDuration = 60;
export const runtime = "nodejs";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const CLIP_DURATION_SEC = 3;
const OUTPUT_FPS = 30;

type ShortsClipInput = {
  videoUrl: string;
  day: number;
  text: string;
};

type RenderShortsBody = {
  clips: ShortsClipInput[];
  weekNumber: number;
};

/** Vercel Amazon Linux / Debian 등 서버리스 환경 폰트 후보 */
const DRAWText_FONT_CANDIDATES = [
  "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
  "/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  process.platform === "win32" ? "C:/Windows/Fonts/arialbd.ttf" : null,
  process.platform === "win32" ? "C:/Windows/Fonts/Arial Bold.ttf" : null,
].filter((p): p is string => Boolean(p));

const BUNDLED_FONT_URLS = [
  "https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/Korean/NotoSansCJKkr-Bold.otf",
  "https://raw.githubusercontent.com/googlefonts/roboto/main/src/hinted/Roboto-Bold.ttf",
];

function cachedBundledFontPath(): string {
  return path.join(os.tmpdir(), "2muns-render-font-kr.otf");
}

/** Vercel: fontconfig 없음 → TTF 절대경로(fontfile) 필수 */
async function ensureDrawtextFontFile(): Promise<string> {
  const systemFont = DRAWText_FONT_CANDIDATES.find((p) => existsSync(p));
  if (systemFont) return systemFont;

  const fontPath = cachedBundledFontPath();
  if (existsSync(fontPath)) {
    const stat = await fs.stat(fontPath);
    if (stat.size > 10_000) return fontPath;
  }

  let lastError = "unknown";
  for (const fontUrl of BUNDLED_FONT_URLS) {
    try {
      const fontRes = await fetch(fontUrl, { cache: "no-store" });
      if (!fontRes.ok) {
        lastError = `HTTP ${fontRes.status} (${fontUrl})`;
        continue;
      }
      const buffer = Buffer.from(await fontRes.arrayBuffer());
      if (buffer.length < 10_000) {
        lastError = `font too small (${buffer.length}B)`;
        continue;
      }
      const partPath = `${fontPath}.${randomUUID()}.part`;
      await fs.writeFile(partPath, buffer);
      await fs.rename(partPath, fontPath);
      return fontPath;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`drawtext font download failed: ${lastError}`);
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

/** drawtext — fontfile 절대경로만 사용 (font= 이름 금지) */
function drawtextFontClause(fontPath: string): string {
  const normalized = path.resolve(fontPath).replace(/\\/g, "/");
  const escaped = normalized.replace(/'/g, "'\\''");
  return `fontfile='${escaped}'`;
}

function buildDrawtextFilter(text: string, fontPath: string, extras: string): string {
  const safeText = escapeDrawtext(text);
  const fontClause = drawtextFontClause(fontPath);
  return `drawtext=${fontClause}:text='${safeText}':${extras}`;
}

function escapeTextfilePath(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/:/g, "\\:");
}

function buildDrawtextTextfileFilter(
  textfilePath: string,
  fontPath: string,
  extras: string,
): string {
  const fontClause = drawtextFontClause(fontPath);
  const fileClause = escapeTextfilePath(textfilePath);
  return `drawtext=${fontClause}:textfile='${fileClause}':${extras}:reload=1`;
}

function sanitizeCaptionText(raw: string, day: number): string {
  const oneLine = raw.replace(/[\r\n]+/g, " ").trim().slice(0, 40);
  return oneLine || `DAY ${day}`;
}

async function writeCaptionTextFile(
  workDir: string,
  clipIndex: number,
  caption: string,
): Promise<string> {
  const filePath = path.join(workDir, `caption-${clipIndex}.txt`);
  await fs.writeFile(filePath, `${caption}\n`, "utf8");
  return filePath;
}

function buildClipVideoFilter(
  day: number,
  fontPath: string,
  captionTextfilePath: string,
): string {
  const badgeX = 48;
  const badgeY = 72;
  const badgeW = 220;
  const badgeH = 58;
  const badgeTextX = badgeX + 22;
  const badgeTextY = badgeY + 14 + 34;
  const badgeTwoWidthPx = 21;

  const normalize = [
    `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
    "setsar=1",
    `tpad=stop_mode=clone:stop_duration=${CLIP_DURATION_SEC}`,
    `trim=duration=${CLIP_DURATION_SEC}`,
    "setpts=PTS-STARTPTS",
    `fps=${OUTPUT_FPS}`,
    "format=yuv420p",
  ];

  const badgeBox = `drawbox=x=${badgeX}:y=${badgeY}:w=${badgeW}:h=${badgeH}:color=black@0.45:t=fill`;
  const badgeTwo = buildDrawtextFilter(
    "2",
    fontPath,
    `fontcolor=white:fontsize=34:x=${badgeTextX}:y=${badgeTextY}`,
  );
  const badgeMuns = buildDrawtextFilter(
    "müns",
    fontPath,
    `fontcolor=0x00FF87:fontsize=34:x=${badgeTextX + badgeTwoWidthPx}:y=${badgeTextY}`,
  );
  const dayText = buildDrawtextFilter(
    `DAY ${day} / 66`,
    fontPath,
    "fontcolor=white:fontsize=56:x=(w-text_w)/2:y=h-200",
  );
  const captionText = buildDrawtextTextfileFilter(
    captionTextfilePath,
    fontPath,
    "fontcolor=white@0.82:fontsize=34:x=(w-text_w)/2:y=h-132",
  );

  return [...normalize, badgeBox, badgeTwo, badgeMuns, dayText, captionText].join(",");
}

function assertSafeVideoUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error("Invalid videoUrl");
  }
  if (url.protocol !== "https:") {
    throw new Error("videoUrl must use HTTPS");
  }
  return url.toString();
}

async function downloadClip(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Clip download failed (${res.status})`);
  }
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length < 256) {
    throw new Error("Clip download too small");
  }
  await fs.writeFile(destPath, bytes);
}

function runFfmpeg(command: ffmpeg.FfmpegCommand, label: string): Promise<void> {
  return new Promise((resolve, reject) => {
    command
      .on("start", (cmdLine) => {
        console.info(`[render-shorts] ffmpeg ${label}:`, cmdLine);
      })
      .on("stderr", (line) => {
        if (line.toLowerCase().includes("error")) {
          console.warn(`[render-shorts] ffmpeg ${label} stderr:`, line);
        }
      })
      .on("end", () => resolve())
      .on("error", (err, _stdout, stderr) => {
        const detail = stderr?.trim() || err.message;
        reject(new Error(`${label} failed: ${detail}`));
      })
      .run();
  });
}

async function renderSingleClip(
  inputPath: string,
  outputPath: string,
  day: number,
  fontPath: string,
  captionText: string,
  workDir: string,
  clipIndex: number,
): Promise<void> {
  const caption = sanitizeCaptionText(captionText, day);
  const captionFile = await writeCaptionTextFile(workDir, clipIndex, caption);
  const vf = buildClipVideoFilter(day, fontPath, captionFile);

  await runFfmpeg(
    ffmpeg(inputPath)
      .inputOptions(["-fflags", "+genpts"])
      .outputOptions([
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-r",
        String(OUTPUT_FPS),
        "-vsync",
        "cfr",
        "-frames:v",
        String(CLIP_DURATION_SEC * OUTPUT_FPS),
        "-reset_timestamps",
        "1",
        "-an",
        "-movflags",
        "+faststart",
      ])
      .output(outputPath),
    `clip-day-${day}`,
  );
}

async function concatClips(segmentPaths: string[], outputPath: string): Promise<void> {
  const listPath = path.join(path.dirname(outputPath), `concat-${randomUUID()}.txt`);
  const listBody = segmentPaths
    .map((p) => {
      const escaped = p.replace(/'/g, "'\\''");
      return `file '${escaped}'`;
    })
    .join("\n");
  await fs.writeFile(listPath, listBody, "utf8");

  try {
    await runFfmpeg(
      ffmpeg()
        .input(listPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions([
          "-c",
          "copy",
          "-movflags",
          "+faststart",
          "-an",
        ])
        .output(outputPath),
      "concat",
    );
  } finally {
    await fs.unlink(listPath).catch(() => {});
  }
}

async function removeWorkDir(workDir: string): Promise<void> {
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

function parseBody(json: unknown): RenderShortsBody {
  if (!json || typeof json !== "object") {
    throw new Error("Invalid JSON body");
  }
  const body = json as Record<string, unknown>;
  const weekNumber = body.weekNumber;
  if (typeof weekNumber !== "number" || !Number.isFinite(weekNumber) || weekNumber < 1) {
    throw new Error("weekNumber must be a positive number");
  }
  const clipsRaw = body.clips;
  if (!Array.isArray(clipsRaw) || clipsRaw.length === 0) {
    throw new Error("clips must be a non-empty array");
  }
  if (clipsRaw.length > 7) {
    throw new Error("clips must contain at most 7 items");
  }

  const clips: ShortsClipInput[] = clipsRaw.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`clips[${index}] invalid`);
    }
    const row = item as Record<string, unknown>;
    const videoUrl = row.videoUrl;
    const day = row.day;
    if (typeof videoUrl !== "string" || !videoUrl.trim()) {
      throw new Error(`clips[${index}].videoUrl required`);
    }
    if (typeof day !== "number" || !Number.isFinite(day) || day < 1) {
      throw new Error(`clips[${index}].day must be a positive number`);
    }
    const textRaw = row.text;
    const text =
      typeof textRaw === "string"
        ? textRaw.trim().slice(0, 80)
        : "";
    return {
      videoUrl: assertSafeVideoUrl(videoUrl),
      day: Math.floor(day),
      text,
    };
  });

  return { clips, weekNumber: Math.floor(weekNumber) };
}

export async function POST(request: NextRequest) {
  let workDir = "";

  try {
    const body = parseBody(await request.json());
    const fontPath = await ensureDrawtextFontFile();
    console.info("[render-shorts] drawtext fontfile:", fontPath);

    workDir = path.join(os.tmpdir(), `2muns-shorts-${randomUUID()}`);
    await fs.mkdir(workDir, { recursive: true });

    const segmentPaths: string[] = [];

    for (let i = 0; i < body.clips.length; i += 1) {
      const clip = body.clips[i]!;
      const rawPath = path.join(workDir, `raw-${i}.mp4`);
      const segPath = path.join(workDir, `seg-${i}.mp4`);

      await downloadClip(clip.videoUrl, rawPath);
      await renderSingleClip(
        rawPath,
        segPath,
        clip.day,
        fontPath,
        clip.text,
        workDir,
        i,
      );
      segmentPaths.push(segPath);
      await fs.unlink(rawPath).catch(() => {});
    }

    const finalPath = path.join(workDir, "highlight.mp4");
    await concatClips(segmentPaths, finalPath);

    const filename = `2muns_week${body.weekNumber}_fhd.mp4`;
    const fileBuffer = await fs.readFile(finalPath);
    await removeWorkDir(workDir);
    workDir = "";

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    console.error("[render-shorts]", err);
    return NextResponse.json({ error: message }, { status: 400 });
  } finally {
    if (workDir) {
      await removeWorkDir(workDir);
    }
  }
}
