import { body, query } from "express-validator";
import { CIT_PERIOD_MONTH } from "../../constants/citFiling";

export const validateCitCalculationQuery = [
  query("year")
    .exists()
    .withMessage("year is required")
    .isInt({ min: 2000, max: 2100 })
    .toInt(),
];

export const validateCitSubmitBody = [
  body("periodYear").isInt({ min: 2000, max: 2100 }).toInt(),
  body("periodMonth").custom((v) => Number(v) === CIT_PERIOD_MONTH),
  body("amount").isFloat({ min: 0 }),
  body("dueDate").matches(/^\d{4}-\d{2}-\d{2}$/),
  body("paymentStatus").isIn(["unpaid", "paid"]),
  body("receiptUrl").optional({ nullable: true }).isString(),
  body("documentUrl").optional({ nullable: true }).isString(),
  body("evidenceVaultId").optional({ nullable: true }).isString(),
  body("rcNumber").isString().trim().notEmpty(),
  body("tin").isString().trim().notEmpty(),
  body("computation").isObject(),
  body("computation.year").isInt({ min: 2000, max: 2100 }),
  body("computation.turnover").isFloat({ min: 0 }),
  body("computation.fixedAssets").isFloat({ min: 0 }),
  body("computation.taxClassCode").isIn(["C08A", "C08C"]),
  body("computation.isSmallCompany").isBoolean(),
  body("computation.accountingProfit").isFloat(),
  body("computation.depreciation").isFloat({ min: 0 }),
  body("computation.fines").isFloat({ min: 0 }),
  body("computation.directorsPersonal").isFloat({ min: 0 }),
  body("computation.otherNonAllowable").isFloat({ min: 0 }),
  body("computation.totalAddBacks").isFloat({ min: 0 }),
  body("computation.frankedDividends").isFloat({ min: 0 }),
  body("computation.assessableProfit").isFloat({ min: 0 }),
  body("computation.chargeableGains").isFloat({ min: 0 }),
  body("computation.capitalAllowancesAvailable").isFloat({ min: 0 }),
  body("computation.capitalAllowancesClaimed").isFloat({ min: 0 }),
  body("computation.unutilizedCapitalAllowances").isFloat({ min: 0 }),
  body("computation.lossCarryForward").isFloat({ min: 0 }),
  body("computation.chargeableProfit").isFloat({ min: 0 }),
  body("computation.citRate").isFloat({ min: 0, max: 30 }),
  body("computation.levyRate").isFloat({ min: 0, max: 4 }),
  body("computation.citAmount").isFloat({ min: 0 }),
  body("computation.developmentLevy").isFloat({ min: 0 }),
  body("computation.grossCit").isFloat({ min: 0 }),
  body("computation.whtCredits").isFloat({ min: 0 }),
  body("computation.whtApplied").isFloat({ min: 0 }),
  body("computation.unutilizedWhtCredits").isFloat({ min: 0 }),
  body("computation.citPayable").isFloat({ min: 0 }),
  body("computation.rcNumber").isString().trim().notEmpty(),
  body("computation.tin").isString().trim().notEmpty(),
  body("computation.companyName").isString(),
  body("computation.allowances").optional().isArray(),
];
