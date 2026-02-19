import express from "express";
import {
  listExpenses,
  getExpenseById,
  createExpense,
} from "../controllers/expensesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import { createExpenseValidation } from "../../middlewares/validations/expensesValidation";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", listExpenses);
router.get("/:id", getExpenseById);
router.post("/", createExpenseValidation, createExpense);

export default router;
