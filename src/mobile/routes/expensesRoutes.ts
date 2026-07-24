import express from "express";
import {
  listExpenses,
  getExpenseById,
  getExpenseDetails,
  createExpense,
  bulkCreateExpenses,
  updateExpense,
  downloadExpenseReceipt,
  deleteExpense,
} from "../controllers/expensesController";
import { authenticate } from "../../middlewares/auth/authMiddleware";
import { requireOnboardingComplete } from "../../middlewares/requireOnboardingComplete";
import {
  createExpenseValidation,
  bulkCreateExpensesValidation,
} from "../../middlewares/validations/expensesValidation";
import { updateExpenseValidation } from "../../middlewares/validations/updateExpenseValidation";
import { validateIdParam } from "../../middlewares/validations/mobileValidation";
import { withPagination } from "../../middlewares/paginationMiddleware";

const router = express.Router();

router.use(authenticate(), requireOnboardingComplete);

router.get("/", withPagination("expenseDate"), listExpenses);
router.post(
  "/bulk",
  (
    req: express.Request,
    _res: express.Response,
    next: express.NextFunction,
  ) => {
    if (!req.body?.items && Array.isArray(req.body?.expenses)) {
      req.body.items = req.body.expenses;
    }
    next();
  },
  bulkCreateExpensesValidation,
  bulkCreateExpenses,
);
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
