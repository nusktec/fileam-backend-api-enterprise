import express from "express";
import {
  listEmployees,
  getEmployeeObligations,
  getEmployeeById,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  fileEmployeeAsExpense,
} from "../controllers/employeesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { validateIdParam, validateCreateEmployee, validateUpdateEmployee } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/obligations", getEmployeeObligations);
router.get("/", withPagination("createdAt"), listEmployees);
router.get("/:id", validateIdParam, getEmployeeById);
router.patch(
  "/:id",
  validateIdParam,
  express.json(),
  validateUpdateEmployee,
  updateEmployee,
);
router.delete("/:id", validateIdParam, deleteEmployee);
router.post("/:id/file-as-expense", validateIdParam, fileEmployeeAsExpense);
router.post("/", express.json(), validateCreateEmployee, createEmployee);

export default router;
