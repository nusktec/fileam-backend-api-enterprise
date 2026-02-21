import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client, s3Bucket, generateS3Url, generateFileKey, validateS3Config, MEDIA_CONFIG } from "../config/s3";

const DEFAULT_FOLDER = MEDIA_CONFIG.UPLOAD_FOLDERS.MEDIA;

export async function uploadToS3(params: {
  buffer: Buffer;
  mimetype: string;
  originalName: string;
  folder?: string;
}): Promise<{ url: string; key: string } | null> {
  if (!validateS3Config()) return null;
  const folder = params.folder && Object.values(MEDIA_CONFIG.UPLOAD_FOLDERS).includes(params.folder as never)
    ? params.folder
    : DEFAULT_FOLDER;
  const key = generateFileKey(folder, params.originalName || "file");
  const command = new PutObjectCommand({
    Bucket: s3Bucket.Bucket,
    Key: key,
    Body: params.buffer,
    ContentType: params.mimetype || "application/octet-stream",
  });
  await s3Client.send(command);
  const url = generateS3Url(key);
  return { url, key };
}
