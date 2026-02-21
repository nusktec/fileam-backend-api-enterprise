import { body } from "express-validator";

/**
 * Optional folder for S3 upload (body field when using multipart).
 * Must be one of the allowed UPLOAD_FOLDERS if provided.
 */
const allowedFolders = [
  "media",
  "images",
  "videos",
  "documents",
  "menu-items",
  "categories",
  "branches",
  "users",
];

export const uploadMediaValidation = [
  body("folder")
    .optional()
    .isString()
    .isIn(allowedFolders)
    .withMessage(`folder must be one of: ${allowedFolders.join(", ")}`),
];
