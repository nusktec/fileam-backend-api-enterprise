import express from "express";
import {
  createFixedAssetSaleReceivable,
  createSupplierRefundReceivable,
  createEmployeeDirectorAdvanceReceivable,
  createTaxRefundReceivable,
  createInvestmentIncomeReceivable,
  listReceivables,
  getReceivableById,
} from "../controllers/receivablesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { withPagination } from "../../middlewares/paginationMiddleware";
import {
  fixedAssetSaleReceivableValidation,
  supplierRefundReceivableValidation,
  employeeDirectorAdvanceValidation,
  taxRefundReceivableValidation,
  investmentIncomeReceivableValidation,
} from "../../middlewares/validations/receivablesValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.post(
  "/fixed-asset-sale",
  express.json(),
  fixedAssetSaleReceivableValidation,
  createFixedAssetSaleReceivable,
);
router.post(
  "/supplier-refund-overpayment",
  express.json(),
  supplierRefundReceivableValidation,
  createSupplierRefundReceivable,
);
router.post(
  "/employee-director-advance",
  express.json(),
  employeeDirectorAdvanceValidation,
  createEmployeeDirectorAdvanceReceivable,
);
router.post(
  "/tax-refund-vat-credit",
  express.json(),
  taxRefundReceivableValidation,
  createTaxRefundReceivable,
);
router.post(
  "/investment-income-owed",
  express.json(),
  investmentIncomeReceivableValidation,
  createInvestmentIncomeReceivable,
);

router.get("/", withPagination(), listReceivables);
router.get("/:receivableId", getReceivableById);

export default router;
