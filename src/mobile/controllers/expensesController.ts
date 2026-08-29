import { Response } from "express";
import { matchedData } from "express-validator";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { expensesService } from "../services/expensesService";
import { HttpReplyError } from "../../utils/httpReplyError";
import { resolveSupplierFields } from "../../utils/directoryResolver";
import { monetaryAmountLimitMessage } from "../../utils/monetaryAmount";
import { normalizeExpenseClass, type ExpenseClass } from "../../constants/expenseClass";

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
    const classFilter = req.query.class as string | undefined;
    let expenseClass: ExpenseClass | undefined;
    if (classFilter?.trim()) {
      expenseClass = normalizeExpenseClass(classFilter.trim()) ?? undefined;
      if (!expenseClass) {
        res
          .status(HttpStatusCode.BAD_REQUEST)
          .json(
            outJson(
              false,
              "class filter must be business, personal, or uncategorized",
              null,
            ),
          );
        return;
      }
    }
    const data = await expensesService.list(userId, {
      page: pagination?.page,
      limit: pagination?.limit,
      sortOrder: pagination?.sortOrder,
      dateFrom: pagination?.dateFrom,
      dateTo: pagination?.dateTo,
      class: expenseClass,
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
      paymentType,
      invoiceDueDate,
    } = b;
    const supplierFields = await resolveSupplierFields(userId, b);
    const expense = await expensesService.create(userId, {
      amount: Number(amount),
      description,
      category,
      expenseType,
      date,
      vatInclusive: Boolean(vatInclusive),
      vatAmount: vatAmount != null ? Number(vatAmount) : undefined,
      receiptUrl,
      paymentType:
        paymentType != null && String(paymentType).trim() !== ""
          ? String(paymentType).trim()
          : undefined,
      invoiceDueDate:
        invoiceDueDate != null && String(invoiceDueDate).trim() !== ""
          ? String(invoiceDueDate)
          : invoiceDueDate === null
            ? null
            : undefined,
      invoiceAmountPaid:
        b.invoiceAmountPaid != null ? b.invoiceAmountPaid : undefined,
      bankCode:
        b.bankCode != null ? String(b.bankCode).trim() || null : undefined,
      class: normalizeExpenseClass(b.class),
      isDeductible:
        b.isDeductible !== undefined ? Boolean(b.isDeductible) : undefined,
      supplierName: supplierFields.supplierName ?? undefined,
      supplierId: supplierFields.supplierId ?? undefined,
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
    const normalized = await Promise.all(
      items.map(async (raw: Record<string, unknown>) => {
        const supplierFields = await resolveSupplierFields(userId, raw);
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
          paymentType:
            raw.paymentType != null && String(raw.paymentType).trim() !== ""
              ? String(raw.paymentType).trim()
              : undefined,
          invoiceDueDate:
            raw.invoiceDueDate != null && String(raw.invoiceDueDate).trim() !== ""
              ? String(raw.invoiceDueDate)
              : raw.invoiceDueDate === null
                ? null
                : undefined,
          invoiceAmountPaid: raw.invoiceAmountPaid,
          class: normalizeExpenseClass(raw.class),
          isDeductible:
            raw.isDeductible !== undefined
              ? Boolean(raw.isDeductible)
              : undefined,
          supplierName: supplierFields.supplierName ?? undefined,
          supplierId: supplierFields.supplierId ?? undefined,
        };
      }),
    );
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
      paymentType: body.paymentType as string | undefined,
      invoiceDueDate:
        body.invoiceDueDate !== undefined
          ? body.invoiceDueDate == null ||
            String(body.invoiceDueDate).trim() === ""
            ? null
            : String(body.invoiceDueDate)
          : undefined,
      invoiceAmountPaid:
        body.invoiceAmountPaid != null ? body.invoiceAmountPaid : undefined,
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
      class: normalizeExpenseClass(body.class),
      isDeductible:
        body.isDeductible !== undefined
          ? Boolean(body.isDeductible)
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

export const updateExpensePaymentStatus = async (
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
    }) as { status: string; bankCode?: string | null };
    const updated = await expensesService.confirmPaymentStatus(
      userId,
      expenseId!,
      body.status,
      body.bankCode,
    );
    if (!updated) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Expense not found", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Expense payment status updated", updated));
  } catch (error) {
    if (replyExpenseError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update expense payment status", null));
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
