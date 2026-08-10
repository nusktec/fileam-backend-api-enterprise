import { body, check } from "express-validator";
import { handleValidation } from "../errorHandler";
import {
  ASSET_TYPES,
  DEPRECIATION_METHODS,
  DISPOSAL_REASONS,
  TRANSFER_TYPES,
  normalizeDepreciationMethod,
} from "../../constants/assets";
import {
  optionalMonetaryAmount,
  requiredMonetaryAmount,
} from "./monetaryAmountValidation";

const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

const METHOD_HINT = DEPRECIATION_METHODS.join(", ");

function assertDepreciationFieldsForMethod(
  value: Record<string, unknown>,
  opts?: { requireMethod?: boolean },
): true {
  const rawMethod = value.depreciationMethod;
  if (rawMethod == null || String(rawMethod).trim() === "") {
    if (opts?.requireMethod) {
      throw new Error("depreciationMethod is required");
    }
    return true;
  }
  const method = normalizeDepreciationMethod(String(rawMethod));
  if (!method) {
    throw new Error(`depreciationMethod must be one of: ${METHOD_HINT}`);
  }

  const purchaseCost = Number(value.purchaseCost);
  const residualRaw = value.residualValue;
  if (residualRaw === undefined || residualRaw === null || residualRaw === "") {
    throw new Error("residualValue is required for depreciation");
  }
  const residual = Number(residualRaw);
  if (!Number.isFinite(residual) || residual < 0) {
    throw new Error("residualValue must be a non-negative number");
  }
  if (Number.isFinite(purchaseCost) && residual >= purchaseCost) {
    throw new Error("residualValue must be less than purchaseCost");
  }

  if (method === "STRAIGHT_LINE" || method === "REDUCING_BALANCE") {
    const life = Number(value.usefulLife);
    if (!Number.isFinite(life) || life <= 0 || !Number.isInteger(life)) {
      throw new Error("usefulLife must be a positive integer (years)");
    }
  }

  if (method === "REDUCING_BALANCE") {
    const rate = Number(value.depreciationRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("depreciationRate must be greater than 0");
    }
    if (rate > 100) {
      throw new Error("depreciationRate must be at most 100");
    }
  }

  if (method === "UNIT_OF_PRODUCTION") {
    const total = Number(value.totalEstimatedUnit);
    const produced = Number(value.unitProduced ?? 0);
    if (!Number.isFinite(total) || total <= 0) {
      throw new Error("totalEstimatedUnit must be greater than 0");
    }
    if (!Number.isFinite(produced) || produced < 0) {
      throw new Error("unitProduced must be a non-negative number");
    }
    if (produced > total) {
      throw new Error("unitProduced cannot exceed totalEstimatedUnit");
    }
  }

  return true;
}

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
    .trim()
    .notEmpty()
    .withMessage("depreciationMethod is required")
    .bail()
    .custom((v) => {
      if (!normalizeDepreciationMethod(String(v))) {
        throw new Error(`depreciationMethod must be one of: ${METHOD_HINT}`);
      }
      return true;
    }),
  check("usefulLife")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("usefulLife must be a positive integer (years)"),
  check("depreciationRate")
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage("depreciationRate must be between 0 and 100"),
  optionalMonetaryAmount("residualValue", "residualValue"),
  check("totalEstimatedUnit")
    .optional({ nullable: true })
    .isFloat({ gt: 0 })
    .withMessage("totalEstimatedUnit must be greater than 0"),
  check("unitProduced")
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage("unitProduced must be a non-negative number"),
  check("serialNumber").optional().trim().isString(),
  check("assetLocation").optional().trim().isString(),
  check("additionalNote").optional().trim().isString(),
  check("assignToConsultant").optional().isBoolean().toBoolean(),
  body().custom((value) =>
    assertDepreciationFieldsForMethod(value, { requireMethod: true }),
  ),
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
    .custom((v) => {
      if (v == null || v === "") return true;
      if (!normalizeDepreciationMethod(String(v))) {
        throw new Error(`depreciationMethod must be one of: ${METHOD_HINT}`);
      }
      return true;
    }),
  check("usefulLife")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("usefulLife must be a positive integer (years)"),
  check("depreciationRate")
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage("depreciationRate must be between 0 and 100"),
  optionalMonetaryAmount("residualValue", "residualValue"),
  check("totalEstimatedUnit")
    .optional({ nullable: true })
    .isFloat({ gt: 0 })
    .withMessage("totalEstimatedUnit must be greater than 0"),
  check("unitProduced")
    .optional({ nullable: true })
    .isFloat({ min: 0 })
    .withMessage("unitProduced must be a non-negative number"),
  check("serialNumber").optional({ nullable: true }).trim().isString(),
  check("assetLocation").optional({ nullable: true }).trim().isString(),
  check("additionalNote").optional({ nullable: true }).trim().isString(),
  check("assignToConsultant").optional().isBoolean().toBoolean(),
  body().custom((value, { req }) => {
    // Only enforce method-specific rules when depreciation fields are being patched.
    const touchesDep =
      value.depreciationMethod !== undefined ||
      value.usefulLife !== undefined ||
      value.depreciationRate !== undefined ||
      value.residualValue !== undefined ||
      value.totalEstimatedUnit !== undefined ||
      value.unitProduced !== undefined ||
      value.purchaseCost !== undefined;
    if (!touchesDep) return true;

    // Merge with existing asset context if controller attached it; otherwise
    // validate only the fields present (service re-checks with full row).
    const merged = { ...(req as { assetForValidation?: Record<string, unknown> }).assetForValidation, ...value };
    if (merged.depreciationMethod == null || merged.depreciationMethod === "") {
      return true;
    }
    if (merged.purchaseCost == null) {
      // purchaseCost may be on the existing row only — skip residual<cost until service.
      return true;
    }
    return assertDepreciationFieldsForMethod(merged);
  }),
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
