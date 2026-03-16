import { Response } from "express";
import { IRequest } from "../interfaces/CustomRequest";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { uploadToS3 } from "../services/mediaUploadService";
import { MEDIA_CONFIG, getPresignedUrl, deleteFromS3 } from "../config/s3";

export async function uploadMedia(req: IRequest, res: Response): Promise<void> {
  const file = req.file;
  if (!file || !file.buffer) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "No file provided. Send multipart form with field 'file'.", null));
    return;
  }
  const mimetype = file.mimetype || "application/octet-stream";
  const allowed = MEDIA_CONFIG.ALLOWED_FILE_TYPES as readonly string[];
  if (!allowed.includes(mimetype)) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, `File type not allowed. Allowed: ${allowed.join(", ")}`, null));
    return;
  }
  if (file.size > MEDIA_CONFIG.MAX_FILE_SIZE) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, `File too large. Max size: ${MEDIA_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`, null));
    return;
  }
  const folder = (req.body?.folder as string) || undefined;
  const result = await uploadToS3({
    buffer: file.buffer,
    mimetype,
    originalName: file.originalname || "file",
    folder,
  });
  if (!result) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Upload failed. S3 may not be configured.", null));
    return;
  }
  res
    .status(HttpStatusCode.CREATED)
    .json(outJson(true, "File uploaded", { url: result.url, key: result.key }));
}

const PRESIGNED_EXPIRY_DEFAULT = 3600;
const PRESIGNED_EXPIRY_MAX = 604800;

export async function getPresignedUrlForView(
  req: IRequest,
  res: Response,
): Promise<void> {
  const key = (req.query.key as string)?.trim();
  if (!key) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Query parameter 'key' is required", null));
    return;
  }
  const rawExpires = req.query.expiresIn;
  let expiresIn = PRESIGNED_EXPIRY_DEFAULT;
  if (rawExpires !== undefined && rawExpires !== "") {
    const n = parseInt(String(rawExpires), 10);
    if (Number.isNaN(n) || n < 60 || n > PRESIGNED_EXPIRY_MAX) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(
            false,
            `expiresIn must be a number between 60 and ${PRESIGNED_EXPIRY_MAX}`,
            null,
          ),
        );
      return;
    }
    expiresIn = n;
  }
  const url = await getPresignedUrl(key, expiresIn);
  if (!url) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to generate media URL", null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "OK", { url }));
}

export async function viewMedia(req: IRequest, res: Response): Promise<void> {
  const key = (req.query.key as string)?.trim();
  if (!key) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Query parameter 'key' is required", null));
    return;
  }
  const rawExpires = req.query.expiresIn;
  let expiresIn = PRESIGNED_EXPIRY_DEFAULT;
  if (rawExpires !== undefined && rawExpires !== "") {
    const n = parseInt(String(rawExpires), 10);
    if (!Number.isNaN(n) && n >= 60 && n <= PRESIGNED_EXPIRY_MAX) expiresIn = n;
  }
  const url = await getPresignedUrl(key, expiresIn);
  if (!url) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to generate media URL", null));
    return;
  }
  res.redirect(302, url);
}

export async function deleteMedia(req: IRequest, res: Response): Promise<void> {
  const key = (req.query.key as string)?.trim();
  if (!key) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, "Query parameter 'key' is required", null));
    return;
  }
  const deleted = await deleteFromS3(key);
  if (!deleted) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to delete file. S3 may not be configured or key may not exist.", null));
    return;
  }
  res.status(HttpStatusCode.OK).json(outJson(true, "File deleted", null));
}
