import express from "express";
import {
  listPayables,
  getPayableById,
  initiatePayment,
} from "../controllers/taxPayablesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", listPayables);
router.get("/:id", getPayableById);
router.post("/:id/initiate-payment", express.json(), initiatePayment);

export default router;
