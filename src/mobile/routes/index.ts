import express from "express";
import authRoutes from "./authRoutes";
import userRoutes from "./userRoutes";
import onboardingRoutes from "../../routes/onboardingRoutes";
import salesRoutes from "./salesRoutes";
import expensesRoutes from "./expensesRoutes";
import taxComputationRoutes from "./taxComputationRoutes";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/onboarding", onboardingRoutes);
router.use("/sales", salesRoutes);
router.use("/expenses", expensesRoutes);
router.use("/tax-computation", taxComputationRoutes);

export default router;
