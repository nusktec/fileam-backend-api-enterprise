import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

dotenv.config();

// S3 configuration
export const S3_CONFIG = {
  ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID || "",
  SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY || "",
  REGION: process.env.S3_REGION || "us-east-1",
  BUCKET_NAME: process.env.S3_BUCKET_NAME || "",
  BUCKET_URL: process.env.S3_BUCKET_URL || "",
  // S3-compatible service configuration
  ENDPOINT: process.env.S3_ENDPOINT || undefined,
  FORCE_PATH_STYLE: process.env.S3_FORCE_PATH_STYLE === "true",
};

// Extract base endpoint for S3 client (remove bucket name if present)
const getBaseEndpoint = (): string | undefined => {
  if (!S3_CONFIG.ENDPOINT) return undefined;
  
  // If endpoint contains bucket name, extract just the base URL
  if (S3_CONFIG.ENDPOINT.includes('/' + S3_CONFIG.BUCKET_NAME)) {
    return S3_CONFIG.ENDPOINT.replace('/' + S3_CONFIG.BUCKET_NAME, '');
  }
  
  return S3_CONFIG.ENDPOINT;
};

// Initialize S3 client
export const s3Client = new S3Client({
  region: S3_CONFIG.REGION,
  credentials: {
    accessKeyId: S3_CONFIG.ACCESS_KEY_ID,
    secretAccessKey: S3_CONFIG.SECRET_ACCESS_KEY,
  },
  // S3-compatible service configuration
  ...(getBaseEndpoint() && { endpoint: getBaseEndpoint() }),
  forcePathStyle: true, // Always use path style for S3-compatible services
});

// S3 bucket configuration
export const s3Bucket = {
  Bucket: S3_CONFIG.BUCKET_NAME,
  region: S3_CONFIG.REGION,
};

// Media upload configuration
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
  ],
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  UPLOAD_FOLDERS: {
    IMAGES: "images",
    VIDEOS: "videos",
    DOCUMENTS: "documents",
    MENU_ITEMS: "menu-items",
    CATEGORIES: "categories",
    BRANCHES: "branches",
    USERS: "users",
  },
} as const;

// Validation function for S3 configuration
export const validateS3Config = (): boolean => {
  if (!S3_CONFIG.ACCESS_KEY_ID) {
    console.error("S3_ACCESS_KEY_ID is not configured");
    return false;
  }
  if (!S3_CONFIG.SECRET_ACCESS_KEY) {
    console.error("S3_SECRET_ACCESS_KEY is not configured");
    return false;
  }
  if (!S3_CONFIG.BUCKET_NAME) {
    console.error("S3_BUCKET_NAME is not configured");
    return false;
  }
  return true;
};

// Generate S3 URL for a given key
export const generateS3Url = (key: string): string => {
  if (S3_CONFIG.ENDPOINT) {
    // For S3-compatible services like Contabo, use the endpoint directly
    // Contabo endpoint already includes the bucket name
    return `${S3_CONFIG.ENDPOINT}/${key}`;
  }
  // Default AWS S3 URL format
  return `https://${S3_CONFIG.BUCKET_NAME}.s3.${S3_CONFIG.REGION}.amazonaws.com/${key}`;
};

// Generate unique file key
export const generateFileKey = (folder: string, filename: string): string => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const extension = filename.split(".").pop();
  const nameWithoutExt = filename.split(".").slice(0, -1).join(".");

  return `${folder}/${nameWithoutExt}-${timestamp}-${randomString}.${extension}`;
};
