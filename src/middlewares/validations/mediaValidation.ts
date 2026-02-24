import { body } from "express-validator";

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
