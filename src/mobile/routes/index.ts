import express from "express";
import authRoutes from "./authRoutes";
import userRoutes from "./userRoutes";
import onboardingRoutes from "../../routes/onboardingRoutes";
import salesRoutes from "./salesRoutes";
import expensesRoutes from "./expensesRoutes";
import taxComputationRoutes from "./taxComputationRoutes";
import taxPayablesRoutes from "./taxPayablesRoutes";
import paymentRecordsRoutes from "./paymentRecordsRoutes";
import filingsRoutes from "./filingsRoutes";
import reportsRoutes from "./reportsRoutes";
import analyticsRoutes from "./analyticsRoutes";
import evidenceVaultRoutes from "./evidenceVaultRoutes";
import employeesRoutes from "./employeesRoutes";
import helpRoutes from "./helpRoutes";

const router = express.Router();

router.use("/auth", authRoutes);
router.use("/user", userRoutes);
router.use("/onboarding", onboardingRoutes);
router.use("/sales", salesRoutes);
router.use("/expenses", expensesRoutes);
router.use("/tax-computation", taxComputationRoutes);
router.use("/tax-payables", taxPayablesRoutes);
router.use("/payments", paymentRecordsRoutes);
router.use("/filings", filingsRoutes);
router.use("/reports", reportsRoutes);
router.use("/analytics", analyticsRoutes);
router.use("/evidence-vault", evidenceVaultRoutes);
router.use("/employees", employeesRoutes);
router.use("/help", helpRoutes);

export default router;
