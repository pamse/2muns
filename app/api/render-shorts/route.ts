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

type ShortsClipInput = {
  videoUrl: string;
  day: number;
};

type RenderShortsBody = {
  clips: ShortsClipInput[];
  weekNumber: number;
};

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

function ffmpegFontfileFilter(fontPath: string): string {
  const normalized = fontPath.replace(/\\/g, "/").replace(/:/g, "\\:");
  return `fontfile='${normalized}'`;
}

async function resolveDrawtextFontPath(): Promise<string | null> {
  const candidates = [
    process.platform === "win32" ? "C:/Windows/Fonts/arialbd.ttf" : null,
    process.platform === "win32" ? "C:/Windows/Fonts/Arial Bold.ttf" : null,
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
  ].filter((p): p is string => Boolean(p));

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function buildClipVideoFilter(day: number, fontPath: string | null): string {
  const badge = escapeDrawtext("2müns");
  const dayLine = escapeDrawtext(`DAY ${day} / 66`);
  const fontOpt = fontPath ? `${ffmpegFontfileFilter(fontPath)}:` : "";

  const badgeText = `drawtext=${fontOpt}text='${badge}':fontcolor=0x00FF87:fontsize=34:x=48:y=72:box=1:boxcolor=black@0.45:boxborderw=14`;
  const dayText = `drawtext=${fontOpt}text='${dayLine}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=h-200`;

  return [
    `scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}:force_original_aspect_ratio=increase`,
    `crop=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}`,
    badgeText,
    dayText,
  ].join(",");
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

function runFfmpeg(command: ffmpeg.FfmpegCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    command.on("end", () => resolve()).on("error", (err) => reject(err)).run();
  });
}

async function renderSingleClip(
  inputPath: string,
  outputPath: string,
  day: number,
  fontPath: string | null,
): Promise<void> {
  const vf = buildClipVideoFilter(day, fontPath);
  await runFfmpeg(
    ffmpeg(inputPath)
      .setStartTime(0)
      .setDuration(CLIP_DURATION_SEC)
      .outputOptions([
        "-vf",
        vf,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-pix_fmt",
        "yuv420p",
        "-an",
        "-movflags",
        "+faststart",
      ])
      .output(outputPath),
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
    return { videoUrl: assertSafeVideoUrl(videoUrl), day: Math.floor(day) };
  });

  return { clips, weekNumber: Math.floor(weekNumber) };
}

export async function POST(request: NextRequest) {
  let workDir = "";

  try {
    const body = parseBody(await request.json());
    const fontPath = await resolveDrawtextFontPath();
    workDir = path.join(os.tmpdir(), `2muns-shorts-${randomUUID()}`);
    await fs.mkdir(workDir, { recursive: true });

    const segmentPaths: string[] = [];

    for (let i = 0; i < body.clips.length; i += 1) {
      const clip = body.clips[i]!;
      const rawPath = path.join(workDir, `raw-${i}.mp4`);
      const segPath = path.join(workDir, `seg-${i}.mp4`);

      await downloadClip(clip.videoUrl, rawPath);
      await renderSingleClip(rawPath, segPath, clip.day, fontPath);
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
