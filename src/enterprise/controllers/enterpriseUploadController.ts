import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { uploadToS3 } from "../../services/mediaUploadService";
import { MEDIA_CONFIG, deleteFromS3 } from "../../config/s3";

/**
 * POST /enterprise/upload
 * Multipart form: field "file" (required)
 * Optional body: folder (e.g. enterprise, documents, evidence-vault)
 * Returns: { url, key } on success
 */
export async function uploadFile(
  req: IRequest,
  res: Response,
): Promise<void> {
  const file = req.file;
  if (!file || !file.buffer) {
    res.status(HttpStatusCode.BAD_REQUEST).json(
      outJson(false, "No file provided. Send multipart form with field 'file'.", null),
    );
    return;
  }
  const mimetype = file.mimetype || "application/octet-stream";
  const allowed = MEDIA_CONFIG.ALLOWED_FILE_TYPES as readonly string[];
  if (!allowed.includes(mimetype)) {
    res.status(HttpStatusCode.BAD_REQUEST).json(
      outJson(
        false,
        `File type not allowed. Allowed: ${allowed.join(", ")}`,
        null,
      ),
    );
    return;
  }
  if (file.size > MEDIA_CONFIG.MAX_FILE_SIZE) {
    res.status(HttpStatusCode.BAD_REQUEST).json(
      outJson(
        false,
        `File too large. Max size: ${MEDIA_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
        null,
      ),
    );
    return;
  }
  const folder =
    (req.body?.folder as string)?.trim() || MEDIA_CONFIG.UPLOAD_FOLDERS.ENTERPRISE;
  const result = await uploadToS3({
    buffer: file.buffer,
    mimetype,
    originalName: file.originalname || "file",
    folder,
  });
  if (!result) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(
      outJson(false, "Upload failed. R2 may not be configured.", null),
    );
    return;
  }
  res.status(HttpStatusCode.CREATED).json(
    outJson(true, "File uploaded successfully", {
      url: result.url,
      key: result.key,
    }),
  );
}

/**
 * DELETE /enterprise/upload?key=<file-key>
 * Deletes file from storage. Key is required (returned from upload).
 */
export async function deleteFile(
  req: IRequest,
  res: Response,
): Promise<void> {
  const key = (req.query.key as string)?.trim();
  if (!key) {
    res.status(HttpStatusCode.BAD_REQUEST).json(
      outJson(false, "Query parameter 'key' is required", null),
    );
    return;
  }
  const deleted = await deleteFromS3(key);
  if (!deleted) {
    res.status(HttpStatusCode.INTERNAL_SERVER_ERROR).json(
      outJson(
        false,
        "Failed to delete file. R2 may not be configured or key may not exist.",
        null,
      ),
    );
    return;
  }
  res.status(HttpStatusCode.OK).json(
    outJson(true, "File deleted successfully", null),
  );
}
