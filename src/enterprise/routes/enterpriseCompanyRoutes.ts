import express from "express";
import enterpriseBusinessProfileRoutes from "./enterpriseBusinessProfileRoutes";
import enterpriseTaxComputationRoutes from "./enterpriseTaxComputationRoutes";
import enterpriseFinancialsRoutes from "./enterpriseFinancialsRoutes";
import enterpriseEvidenceVaultRoutes from "./enterpriseEvidenceVaultRoutes";
import enterpriseFilingsRoutes from "./enterpriseFilingsRoutes";
import enterpriseReportsRoutes from "./enterpriseReportsRoutes";
import enterpriseAssetsRoutes from "./enterpriseAssetsRoutes";
import {
  putClientBusinessProfile,
  putClientContact,
  getClientDetailsHandler,
  getClientDashboardHandler,
} from "../controllers/clientBusinessProfileController";
import { putTaxConfiguration } from "../controllers/clientTaxConfigurationController";
import { enterpriseValidations } from "../../middlewares/validations/enterpriseValidation";

const router = express.Router({ mergeParams: true });

router.get("/details", getClientDetailsHandler);
router.get("/dashboard", getClientDashboardHandler);
router.put(
  "/client-business-profile",
  ...enterpriseValidations.validateClientBusinessProfile,
  putClientBusinessProfile,
);
router.put(
  "/client-contact",
  ...enterpriseValidations.validateClientContact,
  putClientContact,
);
router.put(
  "/tax-configuration",
  ...enterpriseValidations.validateTaxConfiguration,
  putTaxConfiguration,
);

router.use("/business-profile", enterpriseBusinessProfileRoutes);
router.use("/", enterpriseTaxComputationRoutes);
router.use("/financials", enterpriseFinancialsRoutes);
router.use("/evidence-vault", enterpriseEvidenceVaultRoutes);
router.use("/filings", enterpriseFilingsRoutes);
router.use("/reports", enterpriseReportsRoutes);
router.use("/assets", enterpriseAssetsRoutes);

export default router;
