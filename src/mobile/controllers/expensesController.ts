import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { expensesService } from "../services/expensesService";

export const listExpenses = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const pagination = req.pagination;
    const data = await expensesService.list(userId, {
      page: pagination?.page,
      limit: pagination?.limit,
      sortOrder: pagination?.sortOrder,
      dateFrom: pagination?.dateFrom,
      dateTo: pagination?.dateTo,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Expenses retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve expenses", null));
  }
};

export const getExpenseById = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const expenseId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const expense = await expensesService.getById(userId, expenseId!);
    if (!expense) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Expense not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Expense details retrieved", expense));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve expense", null));
  }
};

export const getExpenseDetails = getExpenseById;

export const downloadExpenseReceipt = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const expenseId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const expense = await expensesService.getById(userId, expenseId!);
    if (!expense) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Expense not found", null));
      return;
    }
    if (expense.receiptUrl) {
      res
        .status(HttpStatusCode.OK)
        .json(outJson(true, "Receipt URL", { url: expense.receiptUrl }));
      return;
    }
    const { generatePdfForDocument } = await import(
      "../services/evidenceVaultPdfService"
    );
    const result = await generatePdfForDocument(userId, `expense-${expenseId!}`);
    if (!result) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Receipt not available", null));
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader("Content-Length", result.buffer.length);
    res.status(HttpStatusCode.OK).send(result.buffer);
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to download receipt", null));
  }
};

export const createExpense = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const b = req.body ?? {};
    const {
      amount,
      description,
      category,
      date,
      vatInclusive,
      vatAmount,
      receiptUrl,
    } = b;
    const supplierName = b.supplierName ?? b.Supplier_name;
    const supplierId = b.supplierId ?? b.Supplier_Id;
    const expense = await expensesService.create(userId, {
      amount: Number(amount),
      description,
      category,
      date,
      vatInclusive: Boolean(vatInclusive),
      vatAmount: vatAmount != null ? Number(vatAmount) : undefined,
      receiptUrl,
      supplierName:
        supplierName != null && String(supplierName).trim() !== ""
          ? String(supplierName).trim()
          : undefined,
      supplierId:
        supplierId != null && String(supplierId).trim() !== ""
          ? String(supplierId).trim()
          : undefined,
    });
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, "Expense added", expense));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add expense", null));
  }
};

export const updateExpense = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const expenseId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const body = matchedData(req, {
      locations: ["body"],
      includeOptionals: true,
    }) as Record<string, unknown>;
    const keys = Object.keys(body).filter((k) => body[k] !== undefined);
    if (keys.length === 0) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "Provide at least one field to update", null));
      return;
    }
    const b = req.body ?? {};
    const supplierName = b.supplierName ?? b.Supplier_name;
    const supplierId = b.supplierId ?? b.Supplier_Id;
    const updated = await expensesService.update(userId, expenseId!, {
      description: body.description as string | undefined,
      category: body.category as string | undefined,
      amount: body.amount != null ? Number(body.amount) : undefined,
      vatInclusive:
        body.vatInclusive !== undefined
          ? Boolean(body.vatInclusive)
          : undefined,
      vatAmount:
        body.vatAmount != null ? Number(body.vatAmount) : undefined,
      date: body.date as string | undefined,
      receiptUrl: body.receiptUrl as string | undefined,
      supplierName:
        supplierName !== undefined
          ? supplierName === null || String(supplierName).trim() === ""
            ? null
            : String(supplierName).trim()
          : undefined,
      supplierId:
        supplierId !== undefined
          ? supplierId === null || String(supplierId).trim() === ""
            ? null
            : String(supplierId).trim()
          : undefined,
    });
    if (!updated) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Expense not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Expense updated", updated));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update expense", null));
  }
};

export const deleteExpense = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const expenseId = Array.isArray(req.params.id)
      ? req.params.id[0]
      : req.params.id;
    const ok = await expensesService.deleteForUser(userId, expenseId!);
    if (!ok) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Expense not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Expense deleted", null));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to delete expense", null));
  }
};
