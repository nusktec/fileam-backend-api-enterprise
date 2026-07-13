import express from "express";
import {
  listSales,
  getSaleById,
  getSaleDetails,
  createSale,
  updateSale,
  downloadSaleInvoice,
  markInvoicePaid,
  updateSalePaymentStatus,
  deleteSale,
} from "../controllers/salesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { createSaleValidation } from "../../middlewares/validations/salesValidation";
import { updateSaleValidation } from "../../middlewares/validations/updateSaleValidation";
import { updateSalePaymentStatusValidation } from "../../middlewares/validations/salePaymentStatusValidation";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", withPagination("saleDate"), listSales);
router.delete("/:id", validateIdParam, deleteSale);
router.post("/:id/mark-paid", validateIdParam, markInvoicePaid);
router.patch(
  "/:id/payment-status",
  validateIdParam,
  express.json(),
  updateSalePaymentStatusValidation,
  updateSalePaymentStatus,
);
router.get("/:id/details", validateIdParam, getSaleDetails);
router.get("/:id/download-invoice", validateIdParam, downloadSaleInvoice);
router.patch(
  "/:id",
  validateIdParam,
  express.json(),
  updateSaleValidation,
  updateSale,
);
router.get("/:id", validateIdParam, getSaleById);
router.post("/", createSaleValidation, createSale);

export default router;
