import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2PublicUrlBase, r2PublicUrlForObjectKey } from "@/lib/r2PublicUrl";

export { r2PublicUrlBase, r2PublicUrlForObjectKey } from "@/lib/r2PublicUrl";

const PRESIGN_EXPIRES_SEC = 600;

function r2AccountId() {
  return process.env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? "";
}

export function isR2VideoStorageConfigured(): boolean {
  return Boolean(
    r2AccountId() &&
      process.env.R2_ACCESS_KEY_ID?.trim() &&
      process.env.R2_SECRET_ACCESS_KEY?.trim() &&
      process.env.R2_BUCKET_NAME?.trim() &&
      r2PublicUrlBase(),
  );
}

function createR2Client(): S3Client {
  const accountId = r2AccountId();
  if (!accountId) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!.trim(),
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!.trim(),
    },
  });
}

export async function createR2PresignedPutUrl(input: {
  objectKey: string;
  contentType: string;
  contentLength?: number;
}): Promise<{ uploadUrl: string; objectKey: string; publicUrl: string }> {
  if (!isR2VideoStorageConfigured()) {
    throw new Error("R2 video storage is not configured on the server");
  }

  const bucket = process.env.R2_BUCKET_NAME!.trim();
  const objectKey = input.objectKey.trim().replace(/^\/+/, "");
  const contentType = input.contentType.trim() || "video/mp4";

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    ContentType: contentType,
    ...(input.contentLength != null && input.contentLength > 0
      ? { ContentLength: input.contentLength }
      : {}),
  });

  const client = createR2Client();
  const uploadUrl = await getSignedUrl(client, command, {
    expiresIn: PRESIGN_EXPIRES_SEC,
  });

  const publicUrl = r2PublicUrlForObjectKey(objectKey);
  if (!publicUrl) {
    throw new Error("R2_PUBLIC_URL / NEXT_PUBLIC_R2_PUBLIC_URL is not configured");
  }

  return { uploadUrl, objectKey, publicUrl };
}
