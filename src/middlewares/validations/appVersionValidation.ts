import { query } from "express-validator";
import { handleValidation } from "../errorHandler";
import { APP_PLATFORMS } from "../../constants/appVersion";

const VERSION_PATTERN = /^\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?$/;

export const appVersionCheckValidation = [
  query("platform").optional().isIn(APP_PLATFORMS),
  query("version")
    .optional()
    .matches(VERSION_PATTERN)
    .withMessage("version must be semver-like (e.g. 1.0.0)"),
  handleValidation,
];
