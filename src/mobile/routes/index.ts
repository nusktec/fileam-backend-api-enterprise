import express from "express";
import authRoutes from "./authRoutes";
import userRoutes from "./userRoutes";
import onboardingRoutes from "../../routes/onboardingRoutes";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/onboarding", onboardingRoutes);

export default router;
