import express from "express";
import { listSales, getSaleById, createSale } from "../controllers/salesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { createSaleValidation } from "../../middlewares/validations/salesValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", listSales);
router.get("/:id", getSaleById);
router.post("/", createSaleValidation, createSale);

export default router;
