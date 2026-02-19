import express from "express";
import { getTaxComputation } from "../controllers/taxComputationController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", getTaxComputation);

export default router;
