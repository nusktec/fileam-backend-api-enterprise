import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import { EXPENSE_CATEGORIES } from "../../constants/expenseCategories";

const EXPENSE_COUNTER_ID = "expense_number";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

async function nextExpenseNumber(): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { id: EXPENSE_COUNTER_ID },
    create: { id: EXPENSE_COUNTER_ID, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `EXP-${String(counter.lastNumber).padStart(3, "0")}`;
}

export { EXPENSE_CATEGORIES };
export const expensesService = {
  async list(userId: string) {
    const expenses = await prisma.expense.findMany({
      where: { userId },
      orderBy: { expenseDate: "desc" },
    });

    const summary = await prisma.expense.aggregate({
      where: { userId },
      _sum: { totalAmount: true, vatAmount: true },
    });

    const byCategory = await prisma.expense.groupBy({
      by: ["category"],
      where: { userId },
      _sum: { totalAmount: true },
    });
    const total = decimalToNumber(summary._sum.totalAmount);
    const topCategories = byCategory.map((c) => ({
      category: c.category,
      amount: decimalToNumber(c._sum.totalAmount),
      percentageOfTotal: total > 0 ? (decimalToNumber(c._sum.totalAmount) / total) * 100 : 0,
    })).sort((a, b) => b.amount - a.amount);

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
        amount: decimalToNumber(e.totalAmount),
        vatTag: e.vatInclusive,
      })),
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
      date: expense.expenseDate,
      receipt: expense.receiptUrl ? "Receipt uploaded" : "No receipt uploaded",
      receiptUrl: expense.receiptUrl,
      baseAmount: decimalToNumber(expense.amount),
      vatAmount: expense.vatAmount != null ? decimalToNumber(expense.vatAmount) : null,
      total: decimalToNumber(expense.totalAmount),
      vatInclusive: expense.vatInclusive,
    };
  },

  async create(
    userId: string,
    data: {
      amount: number;
      description: string;
      category: string;
      date: string;
      vatInclusive: boolean;
      vatAmount?: number;
      receiptUrl?: string;
    }
  ) {
    const amount = new Decimal(data.amount);
    const vatAmount = data.vatAmount != null ? new Decimal(data.vatAmount) : null;
    const totalAmount = vatAmount ? amount.add(vatAmount) : amount;

    const expenseNumber = await nextExpenseNumber();

    const expense = await prisma.expense.create({
      data: {
        userId,
        expenseNumber,
        description: data.description,
        category: data.category,
        amount,
        vatInclusive: data.vatInclusive,
        vatAmount,
        totalAmount,
        receiptUrl: data.receiptUrl ?? null,
        expenseDate: new Date(data.date),
      },
    });

    return {
      id: expense.id,
      expenseNumber: expense.expenseNumber,
      description: expense.description,
      date: expense.expenseDate,
      category: expense.category,
      amount: decimalToNumber(expense.totalAmount),
      vatTag: expense.vatInclusive,
    };
  },
};
