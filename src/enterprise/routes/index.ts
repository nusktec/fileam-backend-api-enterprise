import express from "express";
import { health } from "../controllers/healthController";
import onboardingRoutes from "../../routes/onboardingRoutes";
import { createCompany, createInvitation } from "../controllers/companyController";

const router = express.Router();

router.get("/", health);
router.post("/company", createCompany);
router.post("/invitation", createInvitation);
router.use("/onboarding", onboardingRoutes);

export default router;
