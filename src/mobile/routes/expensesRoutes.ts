import express from "express";
import {
  listExpenses,
  getExpenseById,
  getExpenseDetails,
  createExpense,
  createExpensesBulk,
  updateExpense,
  downloadExpenseReceipt,
  deleteExpense,
} from "../controllers/expensesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createExpenseValidation,
  bulkCreateExpenseValidation,
} from "../../middlewares/validations/expensesValidation";
import { updateExpenseValidation } from "../../middlewares/validations/updateExpenseValidation";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", withPagination("expenseDate"), listExpenses);
router.post("/bulk", bulkCreateExpenseValidation, createExpensesBulk);
router.delete("/:id", validateIdParam, deleteExpense);
router.get("/:id/details", validateIdParam, getExpenseDetails);
router.get("/:id/download-receipt", validateIdParam, downloadExpenseReceipt);
router.patch(
  "/:id",
  validateIdParam,
  express.json(),
  updateExpenseValidation,
  updateExpense,
);
router.get("/:id", validateIdParam, getExpenseById);
router.post("/", createExpenseValidation, createExpense);

export default router;
