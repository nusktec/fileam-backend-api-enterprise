import { query } from "express-validator";
import { handleValidation } from "../errorHandler";

export const inventoryPeriodSummaryValidation = [
  query("start")
    .exists()
    .withMessage("start is required")
    .isISO8601()
    .withMessage("start must be a valid date (YYYY-MM-DD)"),
  query("end")
    .exists()
    .withMessage("end is required")
    .isISO8601()
    .withMessage("end must be a valid date (YYYY-MM-DD)"),
  handleValidation,
];
