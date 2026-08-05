import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  VAT_RATE_PERCENT,
} from "../../constants/percentages";
import { EXPENSE_CATEGORIES } from "../../constants/expenseCategories";
import { EXPENSE_TYPES } from "../../constants/expenseTypes";
import {
  isCashPaymentType,
  PAYMENT_TYPE_TRANSFER,
} from "../../constants/salePaymentRules";
import {
  computeInvoicePaymentStatus,
  initialInvoicePaidAmount,
  INVOICE_PAYMENT_STATUS,
} from "../../constants/invoicePaymentStatus";
import {
  assertMonetaryAmountInRange,
  normalizeMoneyAmount,
} from "../../utils/monetaryAmount";
import {
  calendarPeriodFromDate,
  toCalendarDate,
} from "../../utils/dateRangeQuery";
import { taxPayablesService } from "./taxPayablesService";
import { HttpReplyError } from "../../utils/httpReplyError";

const EXPENSE_COUNTER_ID = "expense_number";
const BULK_CREATE_MAX = 100;

/** 1 + VAT rate (e.g. 1.075) — used to extract VAT from an inclusive total. */
const VAT_INCLUSIVE_DIVISOR = 1 + VAT_RATE_PERCENT / PERCENT;

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function optionalInvoiceDueDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  return toCalendarDate(String(value));
}

function assertExpenseFinancials(
  base: Decimal,
  vatAmount: Decimal | null,
  totalAmount: Decimal,
): void {
  assertMonetaryAmountInRange(Number(base), "Amount");
  if (vatAmount != null) {
    assertMonetaryAmountInRange(Number(vatAmount), "VAT amount");
  }
  assertMonetaryAmountInRange(Number(totalAmount), "Total amount");
}

/**
 * Resolve stored base / VAT / total.
 * - vatInclusive: `enteredAmount` is gross (VAT included). Extract VAT; total stays entered.
 * - exclusive + vatAmount: entered is net; total = net + vat.
 * - exclusive, no vat: entered is total, no Input VAT.
 */
function resolveExpenseAmounts(input: {
  enteredAmount: number;
  vatInclusive: boolean;
  vatAmount?: number | null;
}): { base: Decimal; vatAmount: Decimal | null; totalAmount: Decimal } {
  const entered = new Decimal(input.enteredAmount);

  if (input.vatInclusive) {
    const base = entered.div(VAT_INCLUSIVE_DIVISOR);
    const vat = entered.sub(base);
    const baseRounded = new Decimal(normalizeMoneyAmount(Number(base)));
    const vatRounded = new Decimal(normalizeMoneyAmount(Number(vat)));
    const totalRounded = new Decimal(
      normalizeMoneyAmount(Number(baseRounded.add(vatRounded))),
    );
    // Prefer preserving the entered gross as total when rounding allows.
    const total =
      Math.abs(Number(totalRounded) - Number(entered)) < 0.02
        ? new Decimal(normalizeMoneyAmount(Number(entered)))
        : totalRounded;
    const adjustedVat = total.sub(baseRounded);
    assertExpenseFinancials(baseRounded, adjustedVat, total);
    return {
      base: baseRounded,
      vatAmount: adjustedVat,
      totalAmount: total,
    };
  }

  if (input.vatAmount != null && Number(input.vatAmount) > 0) {
    const vat = new Decimal(input.vatAmount);
    const total = entered.add(vat);
    assertExpenseFinancials(entered, vat, total);
    return { base: entered, vatAmount: vat, totalAmount: total };
  }

  assertExpenseFinancials(entered, null, entered);
  return { base: entered, vatAmount: null, totalAmount: entered };
}

async function nextExpenseNumber(): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { id: EXPENSE_COUNTER_ID },
    create: { id: EXPENSE_COUNTER_ID, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `EXP-${String(counter.lastNumber).padStart(3, "0")}`;
}

function mapExpenseListItem(e: {
  id: string;
  expenseNumber: string;
  description: string;
  expenseDate: Date;
  category: string;
  expenseType: string;
  amount: Decimal;
  totalAmount: Decimal;
  vatAmount: Decimal | null;
  vatInclusive: boolean;
  paymentType: string;
  invoiceDueDate: Date | null;
  invoicePaidAmount?: Decimal | null;
  status?: string | null;
  supplierName: string | null;
  supplierId: string | null;
}) {
  const invoicePaidAmount = decimalToNumber(e.invoicePaidAmount);
  const amount = decimalToNumber(e.totalAmount);
  const status = computeInvoicePaymentStatus({
    invoicePaidAmount,
    amount,
    invoiceDueDate: e.invoiceDueDate,
  });
  return {
    id: e.id,
    expenseNumber: e.expenseNumber,
    description: e.description,
    date: e.expenseDate,
    category: e.category,
    expenseType: e.expenseType,
    /** Net / ex-VAT base */
    baseAmount: decimalToNumber(e.amount),
    vatAmount: e.vatAmount != null ? decimalToNumber(e.vatAmount) : null,
    /** Gross total (base + VAT when applicable) */
    amount,
    vatTag: e.vatInclusive,
    vatInclusive: e.vatInclusive,
    paymentType: e.paymentType,
    invoiceDueDate: e.invoiceDueDate,
    invoicePaidAmount,
    status,
    supplierName: e.supplierName ?? null,
    supplierId: e.supplierId ?? null,
  };
}

export { EXPENSE_CATEGORIES, EXPENSE_TYPES };
export const expensesService = {
  async list(
    userId: string,
    opts?: {
      page?: number;
      limit?: number;
      sortOrder?: "ASC" | "DESC";
      dateFrom?: Date;
      dateTo?: Date;
    },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";
    const where: {
      userId: string;
      expenseDate?: { gte?: Date; lte?: Date };
    } = { userId };
    if (opts?.dateFrom || opts?.dateTo) {
      where.expenseDate = {};
      if (opts.dateFrom) where.expenseDate.gte = opts.dateFrom;
      if (opts.dateTo) where.expenseDate.lte = opts.dateTo;
    }

    const [expenses, total, summary, byCategory] = await Promise.all([
      prisma.expense.findMany({
        where,
        orderBy: [{ expenseDate: order }, { createdAt: order }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.expense.count({ where }),
      prisma.expense.aggregate({
        where,
        _sum: { amount: true, vatAmount: true, totalAmount: true },
      }),
      prisma.expense.groupBy({
        by: ["category"],
        where,
        _sum: { amount: true },
      }),
    ]);
    const totalExpenses = decimalToNumber(summary._sum.amount);
    const vatClaimable = decimalToNumber(summary._sum.vatAmount);
    const topCategories = byCategory
      .map((c) => ({
        category: c.category,
        amount: decimalToNumber(c._sum.amount),
        percentageOfTotal:
          totalExpenses > 0
            ? (decimalToNumber(c._sum.amount) / totalExpenses) * PERCENT
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      summary: {
        /** Ex-VAT expense base (Input VAT excluded). */
        totalExpenses,
        /** Sum of Input VAT on VAT-inclusive expenses. */
        vatClaimable,
        /** Gross spend including VAT (optional for clients that need it). */
        totalExpensesIncludingVat: decimalToNumber(summary._sum.totalAmount),
      },
      topCategories,
      expenses: expenses.map(mapExpenseListItem),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getById(userId: string, expenseId: string) {
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });
    if (!expense) return null;
    const invoicePaidAmount = decimalToNumber(expense.invoicePaidAmount);
    const total = decimalToNumber(expense.totalAmount);
    const status = computeInvoicePaymentStatus({
      invoicePaidAmount,
      amount: total,
      invoiceDueDate: expense.invoiceDueDate,
    });
    return {
      id: expense.id,
      expenseNumber: expense.expenseNumber,
      totalAmount: total,
      description: expense.description,
      category: expense.category,
      expenseType: expense.expenseType,
      date: expense.expenseDate,
      receipt: expense.receiptUrl ? "Receipt uploaded" : "No receipt uploaded",
      receiptUrl: expense.receiptUrl,
      baseAmount: decimalToNumber(expense.amount),
      vatAmount:
        expense.vatAmount != null ? decimalToNumber(expense.vatAmount) : null,
      total,
      vatInclusive: expense.vatInclusive,
      paymentType: expense.paymentType,
      invoiceDueDate: expense.invoiceDueDate,
      invoicePaidAmount,
      status,
      supplierName: expense.supplierName ?? null,
      supplierId: expense.supplierId ?? null,
    };
  },

  async create(
    userId: string,
    data: {
      amount: number;
      description: string;
      category: string;
      expenseType?: string;
      date: string;
      vatInclusive: boolean;
      vatAmount?: number;
      receiptUrl?: string;
      supplierName?: string;
      supplierId?: string;
      paymentType?: string;
      invoiceDueDate?: string | null;
      invoicePaidAmount?: number;
      createdById?: string;
    },
  ) {
    const { base, vatAmount, totalAmount } = resolveExpenseAmounts({
      enteredAmount: data.amount,
      vatInclusive: data.vatInclusive,
      vatAmount: data.vatAmount,
    });

    const expenseNumber = await nextExpenseNumber();
    const expenseDate = toCalendarDate(data.date);
    const paymentType =
      data.paymentType != null && String(data.paymentType).trim() !== ""
        ? String(data.paymentType).trim()
        : PAYMENT_TYPE_TRANSFER;
    const invoiceDueDate = optionalInvoiceDueDate(data.invoiceDueDate) ?? null;
    const totalNum = Number(totalAmount);
    const invoicePaidAmount =
      data.invoicePaidAmount != null
        ? Number(data.invoicePaidAmount)
        : initialInvoicePaidAmount(paymentType, totalNum);
    const status = computeInvoicePaymentStatus({
      invoicePaidAmount,
      amount: totalNum,
      invoiceDueDate,
    });

    const expenseType =
      data.expenseType != null && String(data.expenseType).trim() !== ""
        ? String(data.expenseType).trim()
        : "OPEX";

    const expense = await prisma.expense.create({
      data: {
        userId,
        createdById: data.createdById ?? userId,
        expenseNumber,
        description: data.description,
        category: data.category,
        expenseType,
        amount: base,
        vatInclusive: data.vatInclusive,
        vatAmount,
        totalAmount,
        paymentType,
        receiptUrl: data.receiptUrl ?? null,
        supplierName: data.supplierName?.trim() || null,
        supplierId: data.supplierId?.trim() || null,
        expenseDate,
        invoiceDueDate,
        invoicePaidAmount: new Decimal(invoicePaidAmount),
        status,
      },
    });

    await taxPayablesService.syncPayablesForPeriods(userId, [
      calendarPeriodFromDate(expenseDate),
    ]);

    return {
      id: expense.id,
      expenseNumber: expense.expenseNumber,
      description: expense.description,
      date: expense.expenseDate,
      category: expense.category,
      expenseType: expense.expenseType,
      baseAmount: decimalToNumber(expense.amount),
      vatAmount:
        expense.vatAmount != null ? decimalToNumber(expense.vatAmount) : null,
      amount: decimalToNumber(expense.totalAmount),
      vatTag: expense.vatInclusive,
      vatInclusive: expense.vatInclusive,
      paymentType: expense.paymentType,
      invoiceDueDate: expense.invoiceDueDate,
      invoicePaidAmount: decimalToNumber(expense.invoicePaidAmount),
      status: expense.status,
      supplierName: expense.supplierName ?? null,
      supplierId: expense.supplierId ?? null,
    };
  },

  async bulkCreate(
    userId: string,
    items: Array<{
      amount: number;
      description: string;
      category: string;
      expenseType?: string;
      date: string;
      vatInclusive?: boolean;
      vatAmount?: number;
      receiptUrl?: string;
      supplierName?: string;
      supplierId?: string;
      paymentType?: string;
      invoiceDueDate?: string | null;
      invoicePaidAmount?: number;
    }>,
    createdById?: string,
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpReplyError(400, "Provide a non-empty items array");
    }
    if (items.length > BULK_CREATE_MAX) {
      throw new HttpReplyError(
        400,
        `Bulk create limited to ${BULK_CREATE_MAX} expenses per request`,
      );
    }

    const prepared = items.map((raw, index) => {
      if (!raw.description?.trim()) {
        throw new HttpReplyError(
          400,
          `items[${index}]: Description is required`,
        );
      }
      if (!raw.category?.trim()) {
        throw new HttpReplyError(400, `items[${index}]: category is required`);
      }
      if (!raw.date) {
        throw new HttpReplyError(400, `items[${index}]: date is required`);
      }
      let resolved;
      try {
        resolved = resolveExpenseAmounts({
          enteredAmount: Number(raw.amount),
          vatInclusive: Boolean(raw.vatInclusive),
          vatAmount: raw.vatAmount != null ? Number(raw.vatAmount) : undefined,
        });
      } catch (e) {
        if (e instanceof HttpReplyError) {
          throw new HttpReplyError(
            e.statusCode,
            `items[${index}]: ${e.message}`,
          );
        }
        throw e;
      }
      const paymentType =
        raw.paymentType != null && String(raw.paymentType).trim() !== ""
          ? String(raw.paymentType).trim()
          : PAYMENT_TYPE_TRANSFER;
      const invoiceDueDate = optionalInvoiceDueDate(raw.invoiceDueDate) ?? null;
      const totalNum = Number(resolved.totalAmount);
      const invoicePaidAmount =
        raw.invoicePaidAmount != null
          ? Number(raw.invoicePaidAmount)
          : initialInvoicePaidAmount(paymentType, totalNum);
      const status = computeInvoicePaymentStatus({
        invoicePaidAmount,
        amount: totalNum,
        invoiceDueDate,
      });
      return {
        ...resolved,
        description: raw.description.trim(),
        category: raw.category.trim(),
        expenseType:
          raw.expenseType != null && String(raw.expenseType).trim() !== ""
            ? String(raw.expenseType).trim()
            : "OPEX",
        expenseDate: toCalendarDate(raw.date),
        vatInclusive: Boolean(raw.vatInclusive),
        receiptUrl: raw.receiptUrl ?? null,
        supplierName: raw.supplierName?.trim() || null,
        supplierId: raw.supplierId?.trim() || null,
        paymentType,
        invoiceDueDate,
        invoicePaidAmount,
        status,
      };
    });

    const expenses = await prisma.$transaction(async (tx) => {
      const counter = await tx.counter.upsert({
        where: { id: EXPENSE_COUNTER_ID },
        create: { id: EXPENSE_COUNTER_ID, lastNumber: prepared.length },
        update: { lastNumber: { increment: prepared.length } },
      });
      const end = counter.lastNumber;
      const start = end - prepared.length + 1;
      const created = [];
      for (let i = 0; i < prepared.length; i++) {
        const row = prepared[i]!;
        const expenseNumber = `EXP-${String(start + i).padStart(3, "0")}`;
        created.push(
          await tx.expense.create({
            data: {
              userId,
              createdById: createdById ?? userId,
              expenseNumber,
              description: row.description,
              category: row.category,
              expenseType: row.expenseType,
              amount: row.base,
              vatInclusive: row.vatInclusive,
              vatAmount: row.vatAmount,
              totalAmount: row.totalAmount,
              paymentType: row.paymentType,
              receiptUrl: row.receiptUrl,
              supplierName: row.supplierName,
              supplierId: row.supplierId,
              expenseDate: row.expenseDate,
              invoiceDueDate: row.invoiceDueDate,
              invoicePaidAmount: new Decimal(row.invoicePaidAmount),
              status: row.status,
            },
          }),
        );
      }
      return created;
    });

    const periods = [
      ...new Set(
        prepared.map((p) => calendarPeriodFromDate(p.expenseDate)),
      ),
    ];
    await taxPayablesService.syncPayablesForPeriods(userId, periods);

    return {
      created: expenses.length,
      expenses: expenses.map((expense) => ({
        id: expense.id,
        expenseNumber: expense.expenseNumber,
        description: expense.description,
        date: expense.expenseDate,
        category: expense.category,
        expenseType: expense.expenseType,
        baseAmount: decimalToNumber(expense.amount),
        vatAmount:
          expense.vatAmount != null ? decimalToNumber(expense.vatAmount) : null,
        amount: decimalToNumber(expense.totalAmount),
        vatTag: expense.vatInclusive,
        vatInclusive: expense.vatInclusive,
        paymentType: expense.paymentType,
        invoiceDueDate: expense.invoiceDueDate,
        invoicePaidAmount: decimalToNumber(expense.invoicePaidAmount),
        status: expense.status,
        supplierName: expense.supplierName ?? null,
        supplierId: expense.supplierId ?? null,
      })),
    };
  },

  async update(
    userId: string,
    expenseId: string,
    data: Partial<{
      description: string;
      category: string;
      expenseType: string;
      amount: number;
      vatInclusive: boolean;
      vatAmount: number;
      date: string;
      receiptUrl: string;
      supplierName: string | null;
      supplierId: string | null;
      paymentType: string;
      invoiceDueDate: string | null;
      invoicePaidAmount: number;
    }>,
  ) {
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });
    if (!expense) return null;

    const periodsToSync = [calendarPeriodFromDate(expense.expenseDate)];

    const updateData: Record<string, unknown> = {};
    if (data.description != null) updateData.description = data.description;
    if (data.category != null) updateData.category = data.category;
    if (data.expenseType != null) updateData.expenseType = data.expenseType.trim();
    if (data.date != null) {
      const expenseDate = toCalendarDate(data.date);
      updateData.expenseDate = expenseDate;
      periodsToSync.push(calendarPeriodFromDate(expenseDate));
    }
    if (data.vatInclusive != null) updateData.vatInclusive = data.vatInclusive;
    if (data.receiptUrl != null) updateData.receiptUrl = data.receiptUrl;
    if (data.paymentType != null) {
      updateData.paymentType = data.paymentType.trim();
    }
    if (data.invoiceDueDate !== undefined) {
      updateData.invoiceDueDate = optionalInvoiceDueDate(data.invoiceDueDate);
    }
    if (data.invoicePaidAmount != null) {
      updateData.invoicePaidAmount = new Decimal(data.invoicePaidAmount);
    }
    if (data.supplierName !== undefined) {
      updateData.supplierName =
        data.supplierName === null || data.supplierName === ""
          ? null
          : data.supplierName.trim();
    }
    if (data.supplierId !== undefined) {
      updateData.supplierId =
        data.supplierId === null || data.supplierId === ""
          ? null
          : data.supplierId.trim();
    }

    const touchesFinancial =
      data.amount != null ||
      data.vatAmount !== undefined ||
      data.vatInclusive !== undefined;

    if (touchesFinancial) {
      const vatInclusive =
        data.vatInclusive !== undefined
          ? data.vatInclusive
          : expense.vatInclusive;

      // When editing amount under VAT-inclusive, treat entered amount as gross.
      // If only toggling vatInclusive without amount, use current total (gross) as the entered figure.
      const enteredAmount =
        data.amount != null
          ? data.amount
          : vatInclusive
            ? decimalToNumber(expense.totalAmount)
            : decimalToNumber(expense.amount);

      const resolved = resolveExpenseAmounts({
        enteredAmount,
        vatInclusive,
        vatAmount:
          data.vatAmount !== undefined
            ? data.vatAmount
            : vatInclusive
              ? undefined
              : expense.vatAmount != null
                ? decimalToNumber(expense.vatAmount)
                : undefined,
      });

      updateData.amount = resolved.base;
      updateData.vatAmount = resolved.vatAmount;
      updateData.totalAmount = resolved.totalAmount;
      updateData.vatInclusive = vatInclusive;
    }

    const nextTotal =
      updateData.totalAmount != null
        ? Number(updateData.totalAmount as Decimal)
        : decimalToNumber(expense.totalAmount);

    if (
      data.paymentType != null &&
      isCashPaymentType(data.paymentType) &&
      data.invoicePaidAmount == null
    ) {
      updateData.invoicePaidAmount = new Decimal(nextTotal);
    }

    const nextPaid =
      updateData.invoicePaidAmount != null
        ? Number(updateData.invoicePaidAmount as Decimal)
        : decimalToNumber(expense.invoicePaidAmount);

    let nextDue = expense.invoiceDueDate;
    if (data.invoiceDueDate !== undefined) {
      nextDue =
        data.invoiceDueDate === null || String(data.invoiceDueDate).trim() === ""
          ? null
          : toCalendarDate(String(data.invoiceDueDate));
    }

    updateData.status = computeInvoicePaymentStatus({
      invoicePaidAmount: nextPaid,
      amount: nextTotal,
      invoiceDueDate: nextDue,
    });

    const updated = await prisma.expense.update({
      where: { id: expenseId },
      data: updateData,
    });

    await taxPayablesService.syncPayablesForPeriods(userId, periodsToSync);

    return {
      id: updated.id,
      expenseNumber: updated.expenseNumber,
      description: updated.description,
      date: updated.expenseDate,
      category: updated.category,
      expenseType: updated.expenseType,
      baseAmount: decimalToNumber(updated.amount),
      vatAmount:
        updated.vatAmount != null ? decimalToNumber(updated.vatAmount) : null,
      amount: decimalToNumber(updated.totalAmount),
      vatTag: updated.vatInclusive,
      vatInclusive: updated.vatInclusive,
      paymentType: updated.paymentType,
      invoiceDueDate: updated.invoiceDueDate,
      invoicePaidAmount: decimalToNumber(updated.invoicePaidAmount),
      status: updated.status,
      supplierName: updated.supplierName ?? null,
      supplierId: updated.supplierId ?? null,
    };
  },

  async deleteForUser(userId: string, expenseId: string): Promise<boolean> {
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId },
      select: { expenseDate: true },
    });
    if (!expense) return false;
    const period = calendarPeriodFromDate(expense.expenseDate);
    const result = await prisma.expense.deleteMany({
      where: { id: expenseId, userId },
    });
    if (result.count > 0) {
      await taxPayablesService.syncPayablesForPeriods(userId, [period]);
    }
    return result.count > 0;
  },
};
