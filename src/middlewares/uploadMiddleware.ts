import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { outJson } from "../utils/renders";
import { MEDIA_CONFIG } from "../config/s3";

const storage = multer.memoryStorage();

export const uploadSingle = multer({
  storage,
  limits: { fileSize: MEDIA_CONFIG.MAX_FILE_SIZE },
}).single("file");

/** Multiple files — form field name `files` (Asset Reviews evidence upload). */
export const uploadMultiple = multer({
  storage,
  limits: {
    fileSize: MEDIA_CONFIG.MAX_FILE_SIZE,
    files: 10,
  },
}).array("files", 10);

export function handleUploadError(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!err || typeof (err as any).code !== "string") {
    next(err);
    return;
  }
  const multerErr = err as multer.MulterError;
  if (multerErr.code === "LIMIT_FILE_SIZE") {
    res
      .status(400)
      .json(
        outJson(
          false,
          `File too large. Max size: ${MEDIA_CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB`,
          null,
        ),
      );
    return;
  }
  if (multerErr.code === "LIMIT_UNEXPECTED_FILE") {
    res
      .status(400)
      .json(
        outJson(
          false,
          "Unexpected field. Use form field name 'file' (or 'files' for multi-upload).",
          null,
        ),
      );
    return;
  }
  if (multerErr.code === "LIMIT_FILE_COUNT") {
    res
      .status(400)
      .json(outJson(false, "Too many files. Maximum 10 per request.", null));
    return;
  }
  next(err);
}
