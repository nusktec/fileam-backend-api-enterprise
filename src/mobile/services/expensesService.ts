import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  VAT_RATE_PERCENT,
} from "../../constants/percentages";
import { EXPENSE_CATEGORIES } from "../../constants/expenseCategories";
import { EXPENSE_TYPES } from "../../constants/expenseTypes";
import {
  expenseClassForResponse,
  resolveExpenseClassForStorage,
  type ExpenseClass,
} from "../../constants/expenseClass";
import {
  initialSaleStatusForPaymentType,
  isAsyncPaymentType,
  isCashPaymentType,
  isInvoicePaymentType,
  isSalePaidStatus,
  isTransferPaymentType,
  PAYMENT_TYPE_TRANSFER,
  resolveSaleInvoiceStatus,
  SALE_STATUS,
} from "../../constants/salePaymentRules";
import {
  coerceInvoiceAmountPaid,
  initialInvoiceAmountPaid,
  invoiceAmountPaidFromSingle,
  invoiceAmountPaidToJson,
  parseAndValidateInvoiceAmountPaid,
} from "../../constants/invoiceAmountPaid";
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
import { ledgerPostingService } from "../../services/ledgerPostingService";
import { syncExpenseLedgerAfterUpdate, reverseExpenseLedgerOnDelete } from "../../services/ledgerSyncService";
import {
  assertInvoiceNotOverpaid,
  assertInvoicePaymentsAppendOnly,
} from "../../utils/invoicePaymentLedger";
import { resolveSettlementBankCode } from "../../utils/settlementBank";

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

function mapExpenseClassField(
  expenseClass: string | null | undefined,
): ExpenseClass {
  return expenseClassForResponse(expenseClass);
}

function toExpenseLedgerRow(expense: {
  id: string;
  paymentType: string;
  status: string;
  totalAmount: Decimal;
  invoiceAmountPaid: unknown;
  expenseDate: Date;
  settlementBankCode?: string | null;
}) {
  return {
    id: expense.id,
    paymentType: expense.paymentType,
    status: expense.status,
    totalAmount: expense.totalAmount,
    invoiceAmountPaid: expense.invoiceAmountPaid,
    expenseDate: expense.expenseDate,
    settlementBankCode: expense.settlementBankCode ?? null,
  };
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
  invoiceAmountPaid?: unknown;
  status?: string | null;
  supplierName: string | null;
  supplierId: string | null;
  expenseClass?: string | null;
  isDeductible?: boolean;
  settlementBankCode?: string | null;
  paymentConfirmedAt?: Date | null;
}) {
  const invoiceAmountPaid = coerceInvoiceAmountPaid(e.invoiceAmountPaid);
  const amount = decimalToNumber(e.totalAmount);
  const status = resolveSaleInvoiceStatus({
    paymentType: e.paymentType,
    status: e.status,
    invoiceAmountPaid,
    totalAmount: amount,
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
    invoiceAmountPaid,
    status,
    supplierName: e.supplierName ?? null,
    supplierId: e.supplierId ?? null,
    class: mapExpenseClassField(e.expenseClass),
    isDeductible: Boolean(e.isDeductible),
    settlementBankCode: e.settlementBankCode ?? null,
    paymentConfirmedAt: e.paymentConfirmedAt
      ? e.paymentConfirmedAt.toISOString()
      : null,
  };
}

function resolveExpenseClassInput(
  value: unknown,
  field = "class",
): ExpenseClass {
  try {
    return resolveExpenseClassForStorage(value, field);
  } catch {
    throw new HttpReplyError(
      400,
      `${field} must be one of: business, personal, uncategorized`,
    );
  }
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
      class?: ExpenseClass;
    },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";
    const where: {
      userId: string;
      expenseDate?: { gte?: Date; lte?: Date };
      expenseClass?: string;
    } = { userId };
    if (opts?.dateFrom || opts?.dateTo) {
      where.expenseDate = {};
      if (opts.dateFrom) where.expenseDate.gte = opts.dateFrom;
      if (opts.dateTo) where.expenseDate.lte = opts.dateTo;
    }
    if (opts?.class) {
      where.expenseClass = opts.class;
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
    const invoiceAmountPaid = coerceInvoiceAmountPaid(expense.invoiceAmountPaid);
    const total = decimalToNumber(expense.totalAmount);
    const status = resolveSaleInvoiceStatus({
      paymentType: expense.paymentType,
      status: expense.status,
      invoiceAmountPaid,
      totalAmount: total,
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
      invoiceAmountPaid,
      status,
      supplierName: expense.supplierName ?? null,
      supplierId: expense.supplierId ?? null,
      class: mapExpenseClassField(expense.expenseClass),
      isDeductible: expense.isDeductible,
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
      invoiceAmountPaid?: unknown;
      bankCode?: string | null;
      createdById?: string;
      class?: ExpenseClass | null;
      isDeductible?: boolean;
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
    const settledOnCreate = isCashPaymentType(paymentType);
    const invoiceAmountPaid =
      data.invoiceAmountPaid != null
        ? parseAndValidateInvoiceAmountPaid(data.invoiceAmountPaid)
        : initialInvoiceAmountPaid(paymentType, totalNum, {
            fullyPaid: settledOnCreate,
          });
    const status = initialSaleStatusForPaymentType(paymentType, {
      invoiceAmountPaid,
      totalAmount: totalNum,
      invoiceDueDate,
      fullyPaid: settledOnCreate,
    });
    const settlementBankCode = await resolveSettlementBankCode(
      userId,
      paymentType,
      null,
      data.bankCode,
    );

    const expenseType =
      data.expenseType != null && String(data.expenseType).trim() !== ""
        ? String(data.expenseType).trim()
        : "OPEX";
    const expenseClass = resolveExpenseClassInput(data.class);
    const isDeductible = Boolean(data.isDeductible);

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
        invoiceAmountPaid: invoiceAmountPaidToJson(invoiceAmountPaid),
        status,
        settlementBankCode,
        expenseClass,
        isDeductible,
      },
    });

    await ledgerPostingService.postExpenseRecognition(userId, expense);

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
      invoiceAmountPaid: coerceInvoiceAmountPaid(expense.invoiceAmountPaid),
      status: expense.status,
      supplierName: expense.supplierName ?? null,
      supplierId: expense.supplierId ?? null,
      class: mapExpenseClassField(expense.expenseClass),
      isDeductible: expense.isDeductible,
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
      invoiceAmountPaid?: unknown;
      bankCode?: string | null;
      class?: ExpenseClass | null;
      isDeductible?: boolean;
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
      // Bulk: default Transfer → PAID. Card → IN_PROGRESS. Cash → PAID if provided.
      const paymentType =
        raw.paymentType != null && String(raw.paymentType).trim() !== ""
          ? String(raw.paymentType).trim()
          : PAYMENT_TYPE_TRANSFER;
      const invoiceDueDate = optionalInvoiceDueDate(raw.invoiceDueDate) ?? null;
      const totalNum = Number(resolved.totalAmount);
      const fullyPaid =
        isCashPaymentType(paymentType) || isTransferPaymentType(paymentType);
      const invoiceAmountPaid =
        raw.invoiceAmountPaid != null
          ? parseAndValidateInvoiceAmountPaid(
              raw.invoiceAmountPaid,
              `items[${index}].invoiceAmountPaid`,
            )
          : initialInvoiceAmountPaid(paymentType, totalNum, { fullyPaid });
      const status = initialSaleStatusForPaymentType(paymentType, {
        invoiceAmountPaid,
        totalAmount: totalNum,
        invoiceDueDate,
        fullyPaid,
      });
      return {
        ...resolved,
        description: raw.description.trim(),
        category: raw.category.trim(),
        expenseType:
          raw.expenseType != null && String(raw.expenseType).trim() !== ""
            ? String(raw.expenseType).trim()
            : "OPEX",
        expenseClass: resolveExpenseClassInput(
          raw.class,
          `items[${index}].class`,
        ),
        isDeductible: Boolean(raw.isDeductible),
        expenseDate: toCalendarDate(raw.date),
        vatInclusive: Boolean(raw.vatInclusive),
        receiptUrl: raw.receiptUrl ?? null,
        supplierName: raw.supplierName?.trim() || null,
        supplierId: raw.supplierId?.trim() || null,
        paymentType,
        invoiceDueDate,
        invoiceAmountPaid,
        status,
        bankCode: raw.bankCode?.trim() || null,
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
        const settlementBankCode = await resolveSettlementBankCode(
          userId,
          row.paymentType,
          null,
          row.bankCode,
          tx,
        );
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
              invoiceAmountPaid: invoiceAmountPaidToJson(row.invoiceAmountPaid),
              status: row.status,
              settlementBankCode,
              expenseClass: row.expenseClass,
              isDeductible: row.isDeductible,
            },
          }),
        );
      }
      return created;
    });

    for (const expense of expenses) {
      await ledgerPostingService.postExpenseRecognition(userId, expense);
    }

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
        invoiceAmountPaid: coerceInvoiceAmountPaid(expense.invoiceAmountPaid),
        status: expense.status,
        supplierName: expense.supplierName ?? null,
        supplierId: expense.supplierId ?? null,
        class: mapExpenseClassField(expense.expenseClass),
        isDeductible: expense.isDeductible,
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
      invoiceAmountPaid?: unknown;
      bankCode?: string | null;
      class: ExpenseClass | null;
      isDeductible: boolean;
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
    if (data.bankCode !== undefined) {
      updateData.settlementBankCode = data.bankCode
        ? await resolveSettlementBankCode(
            userId,
            data.paymentType ?? expense.paymentType,
            expense.settlementBankCode,
            data.bankCode,
          )
        : null;
    }
    if (data.invoiceDueDate !== undefined) {
      updateData.invoiceDueDate = optionalInvoiceDueDate(data.invoiceDueDate);
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
    if (data.class !== undefined) {
      updateData.expenseClass = resolveExpenseClassInput(data.class);
    }
    if (data.isDeductible !== undefined) {
      updateData.isDeductible = Boolean(data.isDeductible);
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

    let nextDue = expense.invoiceDueDate;
    if (data.invoiceDueDate !== undefined) {
      nextDue =
        data.invoiceDueDate === null || String(data.invoiceDueDate).trim() === ""
          ? null
          : toCalendarDate(String(data.invoiceDueDate));
    }

    const nextPaymentType =
      data.paymentType != null ? data.paymentType.trim() : expense.paymentType;

    // Re-apply payment defaults only when paymentType changes (not on every PATCH).
    if (data.invoiceAmountPaid != null) {
      const previousPaid = coerceInvoiceAmountPaid(expense.invoiceAmountPaid);
      const nextPaid = parseAndValidateInvoiceAmountPaid(data.invoiceAmountPaid);
      assertInvoicePaymentsAppendOnly(previousPaid, nextPaid);
      assertInvoiceNotOverpaid(nextPaid.total, nextTotal);
      updateData.invoiceAmountPaid = invoiceAmountPaidToJson(nextPaid);
    } else if (data.paymentType != null) {
      if (isCashPaymentType(nextPaymentType)) {
        updateData.invoiceAmountPaid = invoiceAmountPaidToJson(
          invoiceAmountPaidFromSingle(nextTotal, nextPaymentType),
        );
      } else if (
        isAsyncPaymentType(nextPaymentType) ||
        isInvoicePaymentType(nextPaymentType)
      ) {
        updateData.invoiceAmountPaid = invoiceAmountPaidToJson(
          initialInvoiceAmountPaid(nextPaymentType, nextTotal),
        );
      }
    } else if (
      touchesFinancial &&
      isCashPaymentType(nextPaymentType) &&
      data.invoiceAmountPaid == null
    ) {
      updateData.invoiceAmountPaid = invoiceAmountPaidToJson(
        invoiceAmountPaidFromSingle(nextTotal, nextPaymentType),
      );
    }

    const nextPaidStruct =
      data.invoiceAmountPaid != null
        ? parseAndValidateInvoiceAmountPaid(data.invoiceAmountPaid)
        : updateData.invoiceAmountPaid != null
          ? coerceInvoiceAmountPaid(updateData.invoiceAmountPaid)
          : coerceInvoiceAmountPaid(expense.invoiceAmountPaid);

    if (expense.status === SALE_STATUS.CANCELLED && data.paymentType == null) {
      // Keep cancelled expenses cancelled unless payment type is changed.
      updateData.status = SALE_STATUS.CANCELLED;
    } else if (isInvoicePaymentType(nextPaymentType)) {
      updateData.status = resolveSaleInvoiceStatus({
        paymentType: nextPaymentType,
        invoiceAmountPaid: nextPaidStruct,
        totalAmount: nextTotal,
        invoiceDueDate: nextDue,
      });
    } else {
      updateData.status = initialSaleStatusForPaymentType(nextPaymentType, {
        invoiceAmountPaid: nextPaidStruct,
        totalAmount: nextTotal,
        fullyPaid: isCashPaymentType(nextPaymentType),
      });
    }

    if (isAsyncPaymentType(nextPaymentType)) {
      updateData.paymentConfirmedAt = null;
    }

    const nextStatus = updateData.status as string;
    const nextLedgerRow = {
      ...toExpenseLedgerRow(expense),
      paymentType: nextPaymentType,
      status: nextStatus,
      totalAmount:
        (updateData.totalAmount as Decimal | undefined) ?? expense.totalAmount,
      invoiceAmountPaid:
        updateData.invoiceAmountPaid ?? expense.invoiceAmountPaid,
      expenseDate:
        (updateData.expenseDate as Date | undefined) ?? expense.expenseDate,
      settlementBankCode:
        (updateData.settlementBankCode as string | null | undefined) ??
        expense.settlementBankCode ??
        null,
    };

    const updated = await prisma.$transaction(async (tx) => {
      await syncExpenseLedgerAfterUpdate(
        userId,
        toExpenseLedgerRow(expense),
        nextLedgerRow,
        tx,
      );
      return tx.expense.update({
        where: { id: expenseId },
        data: updateData,
      });
    });

    await taxPayablesService.syncPayablesForPeriods(userId, periodsToSync);

    return mapExpenseListItem(updated);
  },

  /**
   * Confirm a Card / Transfer expense: IN_PROGRESS → PAID.
   * Invoice expenses are excluded — their status is calculated from
   * invoiceAmountPaid, totalAmount and invoiceDueDate.
   */
  async confirmPaymentStatus(
    userId: string,
    expenseId: string,
    status: string,
    bankCode?: string | null,
  ) {
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });
    if (!expense) return null;

    if (!isSalePaidStatus(status)) {
      throw new HttpReplyError(
        400,
        'Only status "PAID" is accepted on payment-status',
      );
    }

    if (isInvoicePaymentType(expense.paymentType)) {
      throw new HttpReplyError(
        400,
        "Invoice expenses do not use payment-status; their status is calculated from invoiceAmountPaid and invoiceDueDate (use PATCH /expenses/:id with invoiceAmountPaid)",
      );
    }

    if (!isAsyncPaymentType(expense.paymentType)) {
      throw new HttpReplyError(
        400,
        "payment-status applies only to Card or Transfer expenses",
      );
    }

    if (isSalePaidStatus(expense.status)) {
      return mapExpenseListItem(expense);
    }

    if (expense.status !== SALE_STATUS.IN_PROGRESS) {
      throw new HttpReplyError(
        400,
        "Only IN_PROGRESS expenses can be confirmed as PAID",
      );
    }

    const paid = invoiceAmountPaidFromSingle(
      decimalToNumber(expense.totalAmount),
      expense.paymentType,
    );

    const updated = await prisma.$transaction(async (tx) => {
      const settlementBankCode = await resolveSettlementBankCode(
        userId,
        expense.paymentType,
        expense.settlementBankCode,
        bankCode,
        tx,
      );

      const row = await tx.expense.update({
        where: { id: expenseId },
        data: {
          invoiceAmountPaid: invoiceAmountPaidToJson(paid),
          status: SALE_STATUS.PAID,
          paymentConfirmedAt: new Date(),
          settlementBankCode,
        },
      });

      await ledgerPostingService.postExpensePayment(
        userId,
        expenseId,
        decimalToNumber(row.totalAmount),
        row.paymentType,
        row.expenseDate,
        "confirm",
        settlementBankCode,
        tx,
      );

      return row;
    });

    return mapExpenseListItem(updated);
  },

  async deleteForUser(userId: string, expenseId: string): Promise<boolean> {
    const expense = await prisma.expense.findFirst({
      where: { id: expenseId, userId },
    });
    if (!expense) return false;
    const period = calendarPeriodFromDate(expense.expenseDate);

    const deleted = await prisma.$transaction(async (tx) => {
      await reverseExpenseLedgerOnDelete(
        userId,
        toExpenseLedgerRow(expense),
        tx,
      );
      const result = await tx.expense.deleteMany({
        where: { id: expenseId, userId },
      });
      return result.count > 0;
    });

    if (deleted) {
      await taxPayablesService.syncPayablesForPeriods(userId, [period]);
    }
    return deleted;
  },
};
