import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  ASSET_TYPES,
  DEPRECIATION_METHODS,
  DISPOSAL_REASONS,
  TRANSFER_TYPES,
} from "../../constants/assets";
import {
  optionalMonetaryAmount,
  requiredMonetaryAmount,
} from "./monetaryAmountValidation";

const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export const validateCreateAsset = [
  check("assetType")
    .trim()
    .isIn([...ASSET_TYPES])
    .withMessage(`assetType must be one of: ${ASSET_TYPES.join(", ")}`),
  check("assetName").trim().notEmpty().withMessage("assetName is required"),
  check("purchaseDate")
    .matches(DATE_YYYY_MM_DD)
    .withMessage("purchaseDate must be YYYY-MM-DD"),
  requiredMonetaryAmount("purchaseCost", "purchaseCost"),
  check("vendor").optional().trim().isString(),
  check("evidenceUrl").optional().trim().isString(),
  check("depreciationMethod")
    .optional()
    .trim()
    .isIn([...DEPRECIATION_METHODS])
    .withMessage(
      `depreciationMethod must be one of: ${DEPRECIATION_METHODS.join(", ")}`,
    ),
  check("usefulLife")
    .optional()
    .isInt({ min: 1 })
    .withMessage("usefulLife must be a positive integer (years)"),
  optionalMonetaryAmount("residualValue", "residualValue"),
  check("serialNumber").optional().trim().isString(),
  check("assetLocation").optional().trim().isString(),
  check("additionalNote").optional().trim().isString(),
  check("assignToConsultant").optional().isBoolean().toBoolean(),
  handleValidation,
];

export const validateUpdateAsset = [
  check("assetType")
    .optional()
    .trim()
    .isIn([...ASSET_TYPES])
    .withMessage(`assetType must be one of: ${ASSET_TYPES.join(", ")}`),
  check("assetName")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("assetName cannot be empty"),
  check("purchaseDate")
    .optional()
    .matches(DATE_YYYY_MM_DD)
    .withMessage("purchaseDate must be YYYY-MM-DD"),
  optionalMonetaryAmount("purchaseCost", "purchaseCost"),
  check("vendor").optional({ nullable: true }).trim().isString(),
  check("evidenceUrl").optional({ nullable: true }).trim().isString(),
  check("depreciationMethod")
    .optional({ nullable: true })
    .trim()
    .isIn([...DEPRECIATION_METHODS])
    .withMessage(
      `depreciationMethod must be one of: ${DEPRECIATION_METHODS.join(", ")}`,
    ),
  check("usefulLife")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("usefulLife must be a positive integer (years)"),
  optionalMonetaryAmount("residualValue", "residualValue"),
  check("serialNumber").optional({ nullable: true }).trim().isString(),
  check("assetLocation").optional({ nullable: true }).trim().isString(),
  check("additionalNote").optional({ nullable: true }).trim().isString(),
  check("assignToConsultant").optional().isBoolean().toBoolean(),
  handleValidation,
];

export const validateCreateTransfer = [
  check("assetId").trim().notEmpty().withMessage("assetId is required"),
  check("transferType")
    .trim()
    .isIn([...TRANSFER_TYPES])
    .withMessage(`transferType must be one of: ${TRANSFER_TYPES.join(", ")}`),
  check("fromLocation")
    .trim()
    .notEmpty()
    .withMessage("fromLocation is required"),
  check("toLocation").trim().notEmpty().withMessage("toLocation is required"),
  check("transferDate")
    .matches(DATE_YYYY_MM_DD)
    .withMessage("transferDate must be YYYY-MM-DD"),
  check("reason").trim().notEmpty().withMessage("reason is required"),
  handleValidation,
];

export const validateUpdateTransfer = [
  check("transferType")
    .optional()
    .trim()
    .isIn([...TRANSFER_TYPES])
    .withMessage(`transferType must be one of: ${TRANSFER_TYPES.join(", ")}`),
  check("fromLocation")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("fromLocation cannot be empty"),
  check("toLocation")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("toLocation cannot be empty"),
  check("transferDate")
    .optional()
    .matches(DATE_YYYY_MM_DD)
    .withMessage("transferDate must be YYYY-MM-DD"),
  check("reason")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("reason cannot be empty"),
  handleValidation,
];

export const validateCreateSale = [
  check("assetId").trim().notEmpty().withMessage("assetId is required"),
  check("saleDate")
    .matches(DATE_YYYY_MM_DD)
    .withMessage("saleDate must be YYYY-MM-DD"),
  requiredMonetaryAmount("salePrice", "salePrice"),
  check("buyer").trim().notEmpty().withMessage("buyer is required"),
  handleValidation,
];

export const validateCreateDisposal = [
  check("assetId").trim().notEmpty().withMessage("assetId is required"),
  check("disposalReason")
    .trim()
    .isIn([...DISPOSAL_REASONS])
    .withMessage(
      `disposalReason must be one of: ${DISPOSAL_REASONS.join(", ")}`,
    ),
  check("disposalDate")
    .matches(DATE_YYYY_MM_DD)
    .withMessage("disposalDate must be YYYY-MM-DD"),
  check("note").trim().notEmpty().withMessage("note is required"),
  check("evidenceUrl").optional().trim().isString(),
  handleValidation,
];

export const validateUpdateDisposal = [
  check("disposalReason")
    .optional()
    .trim()
    .isIn([...DISPOSAL_REASONS])
    .withMessage(
      `disposalReason must be one of: ${DISPOSAL_REASONS.join(", ")}`,
    ),
  check("disposalDate")
    .optional()
    .matches(DATE_YYYY_MM_DD)
    .withMessage("disposalDate must be YYYY-MM-DD"),
  check("note")
    .optional()
    .trim()
    .notEmpty()
    .withMessage("note cannot be empty"),
  check("evidenceUrl").optional({ nullable: true }).trim().isString(),
  handleValidation,
];
