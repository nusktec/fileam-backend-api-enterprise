import express from "express";
import { listPayments, getPaymentById } from "../controllers/paymentRecordsController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", listPayments);
router.get("/:id", getPaymentById);

export default router;
