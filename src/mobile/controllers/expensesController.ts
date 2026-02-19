import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { expensesService } from "../services/expensesService";

export const listExpenses = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const data = await expensesService.list(userId);
    res.status(HttpStatusCode.OK).json(outJson(true, "Expenses retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve expenses", null));
  }
};

export const getExpenseById = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const expenseId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!expenseId) {
      res.status(HttpStatusCode.BAD_REQUEST).json(outJson(false, "Expense ID required", null));
      return;
    }
    const expense = await expensesService.getById(userId, expenseId);
    if (!expense) {
      res.status(HttpStatusCode.NOT_FOUND).json(outJson(false, "Expense not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Expense details retrieved", expense));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve expense", null));
  }
};

export const createExpense = async (req: IRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(HttpStatusCode.UNAUTHORIZED).json(outJson(false, "Unauthorized", null));
      return;
    }
    const { amount, description, category, date, vatInclusive, vatAmount, receiptUrl } = req.body;
    const expense = await expensesService.create(userId, {
      amount: Number(amount),
      description,
      category,
      date,
      vatInclusive: Boolean(vatInclusive),
      vatAmount: vatAmount != null ? Number(vatAmount) : undefined,
      receiptUrl,
    });
    res.status(HttpStatusCode.CREATED).json(outJson(true, "Expense added", expense));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add expense", null));
  }
};
