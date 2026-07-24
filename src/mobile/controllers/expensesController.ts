import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { expensesService } from "../services/expensesService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { monetaryAmountLimitMessage } from "../../utils/monetaryAmount";

function replyExpenseError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return true;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2000"
  ) {
    res
      .status(HttpStatusCode.BAD_REQUEST)
      .json(outJson(false, monetaryAmountLimitMessage("Amount"), null));
    return true;
  }
  return false;
}

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
      expenseType,
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
      expenseType,
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
    if (replyExpenseError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to add expense", null));
  }
};

export const bulkCreateExpenses = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const items = (req.body?.items ?? req.body?.expenses) as unknown;
    if (!Array.isArray(items)) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(false, "Body must include items (array of expenses)", null),
        );
      return;
    }
    const normalized = items.map((raw: Record<string, unknown>) => {
      const supplierName = raw.supplierName ?? raw.Supplier_name;
      const supplierId = raw.supplierId ?? raw.Supplier_Id;
      return {
        amount: Number(raw.amount),
        description: String(raw.description ?? ""),
        category: String(raw.category ?? ""),
        expenseType:
          raw.expenseType != null ? String(raw.expenseType) : undefined,
        date: String(raw.date ?? ""),
        vatInclusive: Boolean(raw.vatInclusive),
        vatAmount:
          raw.vatAmount != null ? Number(raw.vatAmount) : undefined,
        receiptUrl:
          raw.receiptUrl != null ? String(raw.receiptUrl) : undefined,
        supplierName:
          supplierName != null && String(supplierName).trim() !== ""
            ? String(supplierName).trim()
            : undefined,
        supplierId:
          supplierId != null && String(supplierId).trim() !== ""
            ? String(supplierId).trim()
            : undefined,
      };
    });
    const result = await expensesService.bulkCreate(userId, normalized);
    res
      .status(HttpStatusCode.CREATED)
      .json(outJson(true, `${result.created} expenses added`, result));
  } catch (error) {
    if (replyExpenseError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to bulk add expenses", null));
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
      expenseType: body.expenseType as string | undefined,
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
  } catch (error) {
    if (replyExpenseError(res, error)) return;
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
