import express from "express";
import {
  listEmployees,
  getEmployeeObligations,
  getEmployeeById,
  createEmployee,
  fileEmployeeAsExpense,
} from "../controllers/employeesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validateIdParam, validateCreateEmployee } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/obligations", getEmployeeObligations);
router.get("/", withPagination("createdAt"), listEmployees);
router.get("/:id", validateIdParam, getEmployeeById);
router.post("/:id/file-as-expense", validateIdParam, fileEmployeeAsExpense);
router.post("/", express.json(), validateCreateEmployee, createEmployee);

export default router;
