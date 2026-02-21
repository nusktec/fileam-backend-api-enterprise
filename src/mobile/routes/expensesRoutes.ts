import express from "express";
import {
  listExpenses,
  getExpenseById,
  createExpense,
} from "../controllers/expensesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { createExpenseValidation } from "../../middlewares/validations/expensesValidation";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", withPagination("expenseDate"), listExpenses);
router.get("/:id", validateIdParam, getExpenseById);
router.post("/", createExpenseValidation, createExpense);

export default router;
