import { NextRequest, NextResponse } from "next/server";
import { contentTypeForBlob } from "@/lib/videoFormat";
import { createR2PresignedPutUrl, isR2VideoStorageConfigured } from "@/lib/r2";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { verificationObjectPathForUpsert } from "@/lib/verifications";
export const runtime = "nodejs";

type UploadPresignBody = {
  groupId?: string;
  userId?: string;
  day?: number;
  contentType?: string;
  contentLength?: number;
  /** upsert 경로용 확장자 힌트 */
  extension?: "mp4" | "webm";
};

function normalizeId(value: unknown): string {
  return String(value ?? "").trim();
}

export async function POST(request: NextRequest) {
  const cookieCarrier = new NextResponse();
  const supabase = await createSupabaseRouteHandlerClient(cookieCarrier);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user?.id) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  if (!isR2VideoStorageConfigured()) {
    return NextResponse.json(
      { error: "R2 업로드 설정이 서버에 구성되지 않았습니다." },
      { status: 503 },
    );
  }

  let body: UploadPresignBody;
  try {
    body = (await request.json()) as UploadPresignBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const groupId = normalizeId(body.groupId);
  const userId = normalizeId(body.userId);
  const day = Math.floor(Number(body.day));

  if (!groupId || !userId || !Number.isFinite(day) || day < 1 || day > 66) {
    return NextResponse.json({ error: "groupId, userId, day가 올바르지 않습니다." }, { status: 400 });
  }

  if (normalizeId(user.id).toLowerCase() !== userId.toLowerCase()) {
    return NextResponse.json({ error: "본인 계정으로만 업로드할 수 있습니다." }, { status: 403 });
  }

  const extHint = body.extension === "webm" ? "webm" : "mp4";
  const blobMime =
    body.contentType?.trim() ||
    (extHint === "webm" ? "video/webm" : "video/mp4");
  const pseudoBlob = { type: blobMime } as Blob;
  const contentType = contentTypeForBlob(pseudoBlob);
  const objectKey = verificationObjectPathForUpsert(
    groupId,
    day,
    userId,
    { type: contentType } as Blob,
  );

  try {
    const presigned = await createR2PresignedPutUrl({
      objectKey,
      contentType,
      contentLength:
        typeof body.contentLength === "number" && body.contentLength > 0
          ? body.contentLength
          : undefined,
    });

    const payload = {
      uploadUrl: presigned.uploadUrl,
      objectKey: presigned.objectKey,
      publicUrl: presigned.publicUrl,
      contentType,
      expiresInSec: 600,
    };

    const res = NextResponse.json(payload);
    cookieCarrier.cookies.getAll().forEach((cookie) => {
      res.cookies.set(cookie.name, cookie.value);
    });
    return res;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Presigned URL 생성 실패";
    console.error("[api/upload]", message, error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
