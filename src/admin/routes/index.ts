import express from "express";
import { check } from "express-validator";
import { handleValidation } from "../../middlewares/errorHandler";
import {
  validatePaginationParams,
  withPagination,
} from "../../middlewares/paginationMiddleware";
import { authenticateAdmin } from "../middlewares/adminAuthMiddleware";
import {
  adminLogin,
  adminMe,
  adminMetrics,
  adminCharts,
  adminListUsers,
  adminGetUser,
  adminPatchUser,
  adminListCompanies,
  adminListSales,
  adminListExpenses,
  adminListTaxPayables,
  adminListInvitations,
  adminListConsultantOnboarding,
} from "../controllers/adminController";

const router = express.Router();

router.post(
  "/auth/login",
  [
    check("email").isEmail().normalizeEmail(),
    check("password").notEmpty(),
    handleValidation,
  ],
  adminLogin,
);

router.use(authenticateAdmin());

router.get("/auth/me", adminMe);
router.get("/dashboard/metrics", adminMetrics);
router.get("/dashboard/charts", adminCharts);

const paginated = [validatePaginationParams, withPagination("createdAt")];

router.get("/users", ...paginated, adminListUsers);
router.get("/users/:id", adminGetUser);
router.patch("/users/:id", adminPatchUser);
router.get("/companies", ...paginated, adminListCompanies);
router.get("/sales", ...paginated, adminListSales);
router.get("/expenses", ...paginated, adminListExpenses);
router.get("/tax-payables", ...paginated, adminListTaxPayables);
router.get("/invitations", ...paginated, adminListInvitations);
router.get(
  "/consultant-onboarding",
  ...paginated,
  adminListConsultantOnboarding,
);

export default router;
