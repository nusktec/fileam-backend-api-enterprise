import express from "express";
import enterpriseBusinessProfileRoutes from "./enterpriseBusinessProfileRoutes";
import enterpriseTaxComputationRoutes from "./enterpriseTaxComputationRoutes";
import enterpriseFinancialsRoutes from "./enterpriseFinancialsRoutes";
import enterpriseEvidenceVaultRoutes from "./enterpriseEvidenceVaultRoutes";
const router = express.Router({ mergeParams: true });
router.use("/business-profile", enterpriseBusinessProfileRoutes);
router.use("/", enterpriseTaxComputationRoutes);
router.use("/financials", enterpriseFinancialsRoutes);
router.use("/evidence-vault", enterpriseEvidenceVaultRoutes);

export default router;
