import express from "express";
import { health } from "../controllers/healthController";
import onboardingRoutes from "../../routes/onboardingRoutes";
import consultantOnboardingRoutes from "./consultantOnboardingRoutes";
import { createCompany, createInvitation } from "../controllers/companyController";

const router = express.Router();

router.get("/", health);
router.post("/company", createCompany);
router.post("/invitation", createInvitation);
router.use("/onboarding", onboardingRoutes);
router.use("/consultant-onboarding", consultantOnboardingRoutes);

export default router;
