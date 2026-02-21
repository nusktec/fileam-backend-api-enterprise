import { Response } from "express";
import { IRequest } from "../interfaces/CustomRequest";
import { outJson } from "../utils/renders";
import { HttpStatusCode } from "../interfaces/system";
import { uploadToS3 } from "../services/mediaUploadService";
import { MEDIA_CONFIG } from "../config/s3";

/**
 * Single endpoint for all file uploads. Uploads file to S3 and returns the URL.
 * All other endpoints that need a file (evidence vault, financials, expenses receiptUrl,
 * consultant onboarding docs, etc.) accept fileUrl in the request body — the client
 * should call this endpoint first, then send the returned url to those endpoints.
 */
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
