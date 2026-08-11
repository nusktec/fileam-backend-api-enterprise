import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { EVIDENCE_VAULT_CATEGORIES } from "../../constants/evidenceVault";

export const createEvidenceVaultDocumentValidation = [
  check("url").trim().notEmpty().withMessage("url is required"),
  check("category")
    .trim()
    .notEmpty()
    .withMessage("category is required")
    .isIn([...EVIDENCE_VAULT_CATEGORIES])
    .withMessage(
      `category must be one of: ${EVIDENCE_VAULT_CATEGORIES.join(", ")}`,
    ),
  check("linkedRecord")
    .trim()
    .notEmpty()
    .withMessage(
      "linkedRecord is required (main record id, e.g. sale-{uuid})",
    ),
  check("uploadedDate")
    .optional()
    .isISO8601()
    .withMessage("uploadedDate must be a valid ISO date"),
  check("name").optional().trim().isString(),
  check("fileSizeKb")
    .optional({ nullable: true })
    .isInt({ min: 0 })
    .withMessage("fileSizeKb must be a non-negative integer"),
  handleValidation,
];
