import express from "express";
import { authenticate } from "../middlewares/auth/authMiddleware";
import { uploadSingle, handleUploadError } from "../middlewares/uploadMiddleware";
import { handleValidation } from "../middlewares/errorHandler";
import { uploadMediaValidation } from "../middlewares/validations/mediaValidation";
import { uploadMedia } from "../controllers/mediaUploadController";

const router = express.Router();

/**
 * Single endpoint for all file uploads. Requires auth.
 * POST body: multipart/form-data with field "file" (required).
 * Optional body field: "folder" (one of: media, images, videos, documents, etc.).
 * Returns { url, key }. Use the url in other endpoints (fileUrl, receiptUrl, documentUrl, etc.).
 */
router.post(
  "/upload",
  authenticate(),
  uploadSingle,
  handleUploadError,
  uploadMediaValidation,
  handleValidation,
  uploadMedia,
);

export default router;
