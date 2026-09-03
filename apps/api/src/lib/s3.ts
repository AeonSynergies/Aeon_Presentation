import crypto from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Storage for user-uploaded report images (Deck Builder wizard, Services step — "Report &
// Sample slides"). Same credential model as email.ts's SES client: the api service's App
// Runner instance role has s3:PutObject scoped to this bucket's reports/* prefix
// (infra/aws/deploy.sh), so no access key belongs in env — the SDK's default credential
// chain picks up the instance role automatically.
//
// The bucket serves objects under reports/* with a public-read bucket policy (not
// presigned GETs) — the same trust model this app already uses for every other deck image
// (logos, watermark: plain public URLs under apps/web/public/brand/*), rather than a
// separate access-control system for just this one asset type. Object keys are random
// UUIDs (effectively unguessable), and the WRITE side is what's actually access-controlled:
// only an authenticated, createDeck-permitted request can mint a presigned PUT URL at all.
const REGION = process.env.AWS_REGION || "us-east-1";
const BUCKET = process.env.S3_REPORTS_BUCKET;

const s3 = new S3Client({ region: REGION });

const EXT_BY_CONTENT_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export type UploadableImageType = keyof typeof EXT_BY_CONTENT_TYPE;

export function isUploadableImageType(contentType: string): contentType is UploadableImageType {
  return contentType in EXT_BY_CONTENT_TYPE;
}

export function isS3Configured(): boolean {
  return !!BUCKET;
}

/** Returns a short-lived presigned PUT URL for a fresh, randomly-named object under
 * reports/, plus the permanent public URL it'll be reachable at once the client's own PUT
 * to that presigned URL succeeds (this call never touches S3 itself — no object exists
 * until the client uploads to the URL it returns). */
export async function createReportImageUploadUrl(contentType: UploadableImageType): Promise<{ uploadUrl: string; publicUrl: string }> {
  if (!BUCKET) throw new Error("S3_REPORTS_BUCKET is not configured");
  const key = `reports/${crypto.randomUUID()}.${EXT_BY_CONTENT_TYPE[contentType]}`;
  const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }), { expiresIn: 300 });
  const publicUrl = `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
  return { uploadUrl, publicUrl };
}
