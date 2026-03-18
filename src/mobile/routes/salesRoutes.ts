import express from "express";
import {
  listSales,
  getSaleById,
  getSaleDetails,
  createSale,
  downloadSaleInvoice,
} from "../controllers/salesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { createSaleValidation } from "../../middlewares/validations/salesValidation";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", withPagination("saleDate"), listSales);
router.get("/:id/details", validateIdParam, getSaleDetails);
router.get("/:id/download-invoice", validateIdParam, downloadSaleInvoice);
router.get("/:id", validateIdParam, getSaleById);
router.post("/", createSaleValidation, createSale);

export default router;
