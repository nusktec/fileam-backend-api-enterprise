import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

dotenv.config();

/** Cloudflare R2 Object Storage (S3-compatible) */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "";
/** Public URL base for serving files (e.g. https://pub-xxx.r2.dev or https://files.yourdomain.com) */
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");

const R2_ENDPOINT = R2_ACCOUNT_ID
  ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
  : undefined;

export const S3_CONFIG = {
  /** R2 uses S3-compatible API */
  ACCESS_KEY_ID: R2_ACCESS_KEY_ID,
  SECRET_ACCESS_KEY: R2_SECRET_ACCESS_KEY,
  REGION: "auto" as const,
  BUCKET_NAME: R2_BUCKET_NAME,
  BUCKET_URL: R2_PUBLIC_URL,
  ENDPOINT: R2_ENDPOINT,
  FORCE_PATH_STYLE: true,
  /** R2 does not support ACLs; public access is via bucket settings / custom domain */
  PUBLIC_READ_ACL: false,
};

export const s3Client = new S3Client({
  region: S3_CONFIG.REGION,
  credentials: {
    accessKeyId: S3_CONFIG.ACCESS_KEY_ID,
    secretAccessKey: S3_CONFIG.SECRET_ACCESS_KEY,
  },
  ...(R2_ENDPOINT && { endpoint: R2_ENDPOINT }),
  forcePathStyle: S3_CONFIG.FORCE_PATH_STYLE,
});

export const s3Bucket = {
  Bucket: S3_CONFIG.BUCKET_NAME,
  region: S3_CONFIG.REGION,
};

export const MEDIA_CONFIG = {
  ALLOWED_FILE_TYPES: [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "video/mp4",
    "video/avi",
    "video/mov",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv",
    "application/csv",
    "application/xml",
    "text/xml",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "application/rtf",
  ],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  UPLOAD_FOLDERS: {
    MEDIA: "media",
    IMAGES: "images",
    VIDEOS: "videos",
    DOCUMENTS: "documents",
    EVIDENCE_VAULT: "evidence-vault",
    MENU_ITEMS: "menu-items",
    CATEGORIES: "categories",
    BRANCHES: "branches",
    USERS: "users",
    ENTERPRISE: "enterprise",
  },
} as const;

export const validateS3Config = (): boolean => {
  if (!S3_CONFIG.ACCESS_KEY_ID) {
    console.error("R2_ACCESS_KEY_ID is not configured");
    return false;
  }
  if (!S3_CONFIG.SECRET_ACCESS_KEY) {
    console.error("R2_SECRET_ACCESS_KEY is not configured");
    return false;
  }
  if (!S3_CONFIG.BUCKET_NAME) {
    console.error("R2_BUCKET_NAME is not configured");
    return false;
  }
  if (!R2_ACCOUNT_ID) {
    console.error("R2_ACCOUNT_ID is not configured");
    return false;
  }
  return true;
};

export const generateS3Url = (key: string): string => {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${key}`;
  }
  return `https://${S3_CONFIG.BUCKET_NAME}.r2.cloudflarestorage.com/${key}`;
};

export const generateFileKey = (folder: string, filename: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = filename.split(".").pop();
  const nameWithoutExt = filename.split(".").slice(0, -1).join(".");

  return `${folder}/${nameWithoutExt}-${timestamp}-${randomString}.${extension}`;
};

const DEFAULT_PRESIGNED_EXPIRY_SECONDS = 3600;

export async function getPresignedUrl(
  key: string,
  expiresInSeconds: number = DEFAULT_PRESIGNED_EXPIRY_SECONDS,
): Promise<string | null> {
  if (!validateS3Config()) return null;
  const command = new GetObjectCommand({
    Bucket: s3Bucket.Bucket,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
}

export async function deleteFromS3(key: string): Promise<boolean> {
  if (!validateS3Config()) return false;
  try {
    const command = new DeleteObjectCommand({
      Bucket: s3Bucket.Bucket,
      Key: key,
    });
    await s3Client.send(command);
    return true;
  } catch {
    return false;
  }
}
