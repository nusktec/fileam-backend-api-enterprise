import { param } from "express-validator";
import { handleValidation } from "../errorHandler";

/**
 * Use on routes that have :id param (e.g. GET /documents/:id).
 * Use only on routes already protected by authenticate() middleware.
 */
export const validateIdParam = [
  param("id").notEmpty().trim().withMessage("ID is required"),
  handleValidation,
];
