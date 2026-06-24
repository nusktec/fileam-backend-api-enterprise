import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  VAT_RATE_PERCENT,
} from "../../constants/percentages";
import { EXPENSE_CATEGORIES } from "../../constants/expenseCategories";
import { EXPENSE_TYPES, isValidExpenseType } from "../../constants/expenseTypes";
import { assertMonetaryAmountInRange } from "../../utils/monetaryAmount";
import {
  calendarPeriodFromDate,
  toCalendarDate,
} from "../../utils/dateRangeQuery";
import { taxPayablesService } from "./taxPayablesService";

const EXPENSE_COUNTER_ID = "expense_number";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
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

async function nextExpenseNumber(): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { id: EXPENSE_COUNTER_ID },
    create: { id: EXPENSE_COUNTER_ID, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `EXP-${String(counter.lastNumber).padStart(3, "0")}`;
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
        _sum: { totalAmount: true, vatAmount: true },
      }),
      prisma.expense.groupBy({
        by: ["category"],
        where,
        _sum: { totalAmount: true },
      }),
    ]);
    const totalAmount = decimalToNumber(summary._sum.totalAmount);
    const topCategories = byCategory
      .map((c) => ({
        category: c.category,
        amount: decimalToNumber(c._sum.totalAmount),
        percentageOfTotal:
          totalAmount > 0
            ? (decimalToNumber(c._sum.totalAmount) / totalAmount) * PERCENT
            : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    return {
      summary: {
        totalExpenses: decimalToNumber(summary._sum.totalAmount),
        vatClaimable: decimalToNumber(summary._sum.vatAmount),
      },
      topCategories,
      expenses: expenses.map((e) => ({
        id: e.id,
        expenseNumber: e.expenseNumber,
        description: e.description,
        date: e.expenseDate,
        category: e.category,
        expenseType: e.expenseType,
        amount: decimalToNumber(e.totalAmount),
        vatTag: e.vatInclusive,
        supplierName: e.supplierName ?? null,
        supplierId: e.supplierId ?? null,
      })),
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
    return {
      id: expense.id,
      expenseNumber: expense.expenseNumber,
      totalAmount: decimalToNumber(expense.totalAmount),
      description: expense.description,
      category: expense.category,
      expenseType: expense.expenseType,
      date: expense.expenseDate,
      receipt: expense.receiptUrl ? "Receipt uploaded" : "No receipt uploaded",
      receiptUrl: expense.receiptUrl,
      baseAmount: decimalToNumber(expense.amount),
      vatAmount:
        expense.vatAmount != null ? decimalToNumber(expense.vatAmount) : null,
      total: decimalToNumber(expense.totalAmount),
      vatInclusive: expense.vatInclusive,
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
      createdById?: string;
    },
  ) {
    const amount = new Decimal(data.amount);
    const vatAmount =
      data.vatAmount != null ? new Decimal(data.vatAmount) : null;
    const totalAmount = vatAmount ? amount.add(vatAmount) : amount;
    assertExpenseFinancials(amount, vatAmount, totalAmount);

    const expenseNumber = await nextExpenseNumber();
    const expenseDate = toCalendarDate(data.date);

    const expenseType =
      data.expenseType != null && isValidExpenseType(data.expenseType)
        ? data.expenseType
        : "OPEX";

    const expense = await prisma.expense.create({
      data: {
        userId,
        createdById: data.createdById ?? userId,
        expenseNumber,
        description: data.description,
        category: data.category,
        expenseType,
        amount,
        vatInclusive: data.vatInclusive,
        vatAmount,
        totalAmount,
        receiptUrl: data.receiptUrl ?? null,
        supplierName: data.supplierName?.trim() || null,
        supplierId: data.supplierId?.trim() || null,
        expenseDate,
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
      amount: decimalToNumber(expense.totalAmount),
      vatTag: expense.vatInclusive,
      supplierName: expense.supplierName ?? null,
      supplierId: expense.supplierId ?? null,
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
    if (data.expenseType != null) {
      if (!isValidExpenseType(data.expenseType)) {
        throw new Error(
          `expenseType must be one of: ${EXPENSE_TYPES.join(", ")}`,
        );
      }
      updateData.expenseType = data.expenseType;
    }
    if (data.date != null) {
      const expenseDate = toCalendarDate(data.date);
      updateData.expenseDate = expenseDate;
      periodsToSync.push(calendarPeriodFromDate(expenseDate));
    }
    if (data.vatInclusive != null) updateData.vatInclusive = data.vatInclusive;
    if (data.receiptUrl != null) updateData.receiptUrl = data.receiptUrl;
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
      const base =
        data.amount != null ? new Decimal(data.amount) : expense.amount;
      const vatInclusive =
        data.vatInclusive !== undefined
          ? data.vatInclusive
          : expense.vatInclusive;

      let nextBase = base;
      let nextVat: Decimal | null = null;
      let nextTotal = base;

      if (data.vatAmount != null) {
        const vat = new Decimal(data.vatAmount);
        const vatNum = Number(vat);
        nextBase = base;
        nextVat = vatNum > 0 ? vat : null;
        nextTotal = vatNum > 0 ? base.add(vat) : base;
      } else if (vatInclusive) {
        const vat = base.mul(VAT_RATE_PERCENT / PERCENT);
        nextBase = base;
        nextVat = vat;
        nextTotal = base.add(vat);
      } else {
        nextBase = base;
        nextVat = null;
        nextTotal = base;
      }

      assertExpenseFinancials(nextBase, nextVat, nextTotal);
      updateData.amount = nextBase;
      updateData.vatAmount = nextVat;
      updateData.totalAmount = nextTotal;
    }

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
      amount: decimalToNumber(updated.totalAmount),
      vatTag: updated.vatInclusive,
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
