import { check } from "express-validator";
import { handleValidation } from "../errorHandler";
import { UNIT_ATTRIBUTION_PERIOD_TYPES } from "../../constants/unitAttribution";

export const createUnitAttributionValidation = [
  check("assetId").trim().notEmpty().withMessage("assetId is required"),
  check("productName").trim().notEmpty().withMessage("productName is required"),
  check("unitOfMeasurement")
    .trim()
    .notEmpty()
    .withMessage("unitOfMeasurement is required"),
  check("periodType")
    .trim()
    .isIn([...UNIT_ATTRIBUTION_PERIOD_TYPES])
    .withMessage(
      `periodType must be one of: ${UNIT_ATTRIBUTION_PERIOD_TYPES.join(", ")}`,
    ),
  check("brandName").optional({ nullable: true }).trim(),
  check("skuCode").optional({ nullable: true }).trim(),
  check("description").optional({ nullable: true }).trim(),
  check("administratorName").optional({ nullable: true }).trim(),
  check("factoryPlantName").optional({ nullable: true }).trim(),
  check("department").optional({ nullable: true }).trim(),
  check("branchLocation").optional({ nullable: true }).trim(),
  handleValidation,
];

export const recordUnitProductionValidation = [
  check("periodStart")
    .trim()
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage("periodStart must be YYYY-MM-DD"),
  check("unitsAttributed")
    .isInt({ gt: 0 })
    .withMessage("unitsAttributed must be a positive integer"),
  check("unitCost").optional({ nullable: true }).isFloat({ min: 0 }),
  check("batchLotNumber").optional({ nullable: true }).trim(),
  check("productionLine").optional({ nullable: true }).trim(),
  check("shift").optional({ nullable: true }).trim(),
  check("locationWarehouse").optional({ nullable: true }).trim(),
  handleValidation,
];
