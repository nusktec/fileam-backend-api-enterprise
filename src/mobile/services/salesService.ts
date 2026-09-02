import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import { PERCENT, VAT_RATE_PERCENT } from "../../constants/percentages";
import {
  initialSaleStatusForPaymentType,
  isAsyncPaymentType,
  isCashPaymentType,
  isInvoicePaymentType,
  isTransferPaymentType,
  isSalePaidStatus,
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
  type InvoiceAmountPaid,
} from "../../constants/invoiceAmountPaid";
import { HttpReplyError } from "../../utils/httpReplyError";
import {
  assertMonetaryAmountInRange,
  normalizeMoneyAmount,
} from "../../utils/monetaryAmount";
import {
  calendarPeriodFromDate,
  toCalendarDate,
} from "../../utils/dateRangeQuery";
import { taxPayablesService } from "./taxPayablesService";
import { ledgerPostingService } from "../../services/ledgerPostingService";
import { syncSaleLedgerAfterUpdate, reverseSaleLedgerOnDelete } from "../../services/ledgerSyncService";
import {
  assertInvoiceNotOverpaid,
  assertInvoicePaymentsAppendOnly,
} from "../../utils/invoicePaymentLedger";
import { resolveSettlementBankCode } from "../../utils/settlementBank";

const BULK_CREATE_MAX = 100;

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function nullableTrimmed(
  value: string | null | undefined,
): string | null {
  if (value === undefined || value === null) return null;
  const t = String(value).trim();
  return t === "" ? null : t;
}

function optionalInvoiceDueDate(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  return toCalendarDate(String(value));
}

function assertSaleFinancials(
  amount: Decimal,
  vatAmount: Decimal,
  totalAmount: Decimal,
): void {
  assertMonetaryAmountInRange(Number(amount), "Amount");
  assertMonetaryAmountInRange(Number(vatAmount), "VAT amount");
  assertMonetaryAmountInRange(Number(totalAmount), "Total amount");
}

/**
 * Resolve stored net / VAT / total for a sale.
 * `vatableIncome` and `vatInclusive` are mutually exclusive:
 * - vatInclusive: entered amount is gross (total).
 *   base = total / (1 + VAT rate); vat = total − base; ensure total = base + vat.
 * - vatableIncome: entered amount is net; add 7.5% VAT on top.
 * - neither: no VAT.
 */
function assertExclusiveVatFlags(
  vatableIncome: boolean,
  vatInclusive: boolean,
  label = "",
): void {
  if (vatableIncome && vatInclusive) {
    throw new HttpReplyError(
      400,
      `${label}vatableIncome and vatInclusive cannot both be true. Use vatInclusive for VAT-inclusive amounts, or vatableIncome to add VAT on a net amount.`,
    );
  }
}

/** 1 + VAT rate (e.g. 1.075) — Base = Total / divisor for VAT-inclusive. */
const VAT_INCLUSIVE_DIVISOR = 1 + VAT_RATE_PERCENT / PERCENT;

function resolveSaleAmounts(input: {
  enteredAmount: number;
  vatableIncome: boolean;
  vatInclusive: boolean;
}): {
  amount: Decimal;
  vatRate: Decimal;
  vatAmount: Decimal;
  totalAmount: Decimal;
} {
  assertExclusiveVatFlags(input.vatableIncome, input.vatInclusive);
  const entered = new Decimal(input.enteredAmount);

  if (input.vatInclusive) {
    const total = new Decimal(normalizeMoneyAmount(Number(entered)));
    const base = total.div(VAT_INCLUSIVE_DIVISOR);
    const amountRounded = new Decimal(normalizeMoneyAmount(Number(base)));
    const vatRounded = new Decimal(
      normalizeMoneyAmount(Number(total.sub(amountRounded))),
    );
    // Keep total = base + vat exactly (prefer entered gross as total).
    const reconciledTotal = amountRounded.add(vatRounded);
    const totalFinal =
      Math.abs(Number(reconciledTotal) - Number(total)) < 0.02
        ? total
        : new Decimal(normalizeMoneyAmount(Number(reconciledTotal)));
    const vatFinal = totalFinal.sub(amountRounded);
    assertSaleFinancials(amountRounded, vatFinal, totalFinal);
    return {
      amount: amountRounded,
      vatRate: new Decimal(VAT_RATE_PERCENT),
      vatAmount: vatFinal,
      totalAmount: totalFinal,
    };
  }

  if (input.vatableIncome) {
    const vatAmount = entered.mul(VAT_RATE_PERCENT / PERCENT);
    const vatRounded = new Decimal(normalizeMoneyAmount(Number(vatAmount)));
    const totalAmount = entered.add(vatRounded);
    assertSaleFinancials(entered, vatRounded, totalAmount);
    return {
      amount: entered,
      vatRate: new Decimal(VAT_RATE_PERCENT),
      vatAmount: vatRounded,
      totalAmount,
    };
  }

  assertSaleFinancials(entered, new Decimal(0), entered);
  return {
    amount: entered,
    vatRate: new Decimal(0),
    vatAmount: new Decimal(0),
    totalAmount: entered,
  };
}

function toSaleLedgerRow(sale: {
  id: string;
  paymentType: string;
  status: string;
  amount: Decimal;
  vatAmount: Decimal;
  totalAmount: Decimal;
  invoiceAmountPaid: unknown;
  saleDate: Date;
  settlementBankCode?: string | null;
}) {
  return {
    id: sale.id,
    paymentType: sale.paymentType,
    status: sale.status,
    amount: sale.amount,
    vatAmount: sale.vatAmount,
    totalAmount: sale.totalAmount,
    invoiceAmountPaid: sale.invoiceAmountPaid,
    saleDate: sale.saleDate,
    settlementBankCode: sale.settlementBankCode ?? null,
  };
}

function mapSaleSummary(sale: {
  id: string;
  invoiceNumber: string;
  status: string;
  description: string;
  itemName: string | null;
  saleDate: Date;
  amount: Decimal;
  vatAmount: Decimal;
  totalAmount: Decimal;
  customerName: string | null;
  customerId: string | null;
  receiptUrl: string | null;
  paymentConfirmedAt?: Date | null;
  paymentType?: string;
  invoiceDueDate?: Date | null;
  invoiceAmountPaid?: unknown;
  category?: string | null;
  settlementBankCode?: string | null;
}) {
  const invoiceAmountPaid = coerceInvoiceAmountPaid(sale.invoiceAmountPaid);
  const totalAmount = decimalToNumber(sale.totalAmount);
  const amountPaid = normalizeMoneyAmount(invoiceAmountPaid.total);
  const outstandingBalance = normalizeMoneyAmount(
    Math.max(0, totalAmount - amountPaid),
  );
  const status = resolveSaleInvoiceStatus({
    paymentType: sale.paymentType,
    status: sale.status,
    invoiceAmountPaid,
    totalAmount,
    invoiceDueDate: sale.invoiceDueDate,
  });
  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    status,
    description: sale.description,
    itemName: sale.itemName ?? null,
    category: sale.category ?? null,
    date: sale.saleDate,
    amount: decimalToNumber(sale.amount),
    vatAmount: decimalToNumber(sale.vatAmount),
    totalAmount,
    amountPaid,
    outstandingBalance,
    customerName: sale.customerName ?? null,
    customerId: sale.customerId ?? null,
    receiptUrl: sale.receiptUrl ?? null,
    paymentType: sale.paymentType,
    invoiceDueDate: sale.invoiceDueDate ?? null,
    invoiceAmountPaid,
    paymentConfirmedAt: sale.paymentConfirmedAt
      ? sale.paymentConfirmedAt.toISOString()
      : null,
    settlementBankCode: sale.settlementBankCode ?? null,
  };
}

function resolveSaleStatusAfterPatch(
  sale: {
    paymentType: string;
    status: string;
    invoiceAmountPaid: unknown;
    totalAmount: Decimal;
    invoiceDueDate: Date | null;
  },
  data: Partial<{
    paymentType: string;
    status: string;
    invoiceAmountPaid: InvoiceAmountPaid;
    invoiceDueDate: string | null;
  }>,
  totalAmount: number,
): string {
  if (data.status === SALE_STATUS.CANCELLED) {
    return SALE_STATUS.CANCELLED;
  }
  if (sale.status === SALE_STATUS.CANCELLED && data.status == null) {
    return SALE_STATUS.CANCELLED;
  }

  const nextPaymentType = data.paymentType ?? sale.paymentType;

  if (!isInvoicePaymentType(nextPaymentType)) {
    const paid =
      data.invoiceAmountPaid != null
        ? data.invoiceAmountPaid
        : coerceInvoiceAmountPaid(sale.invoiceAmountPaid);
    return initialSaleStatusForPaymentType(nextPaymentType, {
      invoiceAmountPaid: paid,
      totalAmount,
      fullyPaid: isCashPaymentType(nextPaymentType),
    });
  }

  const paid =
    data.invoiceAmountPaid != null
      ? data.invoiceAmountPaid
      : coerceInvoiceAmountPaid(sale.invoiceAmountPaid);

  let dueDate = sale.invoiceDueDate;
  if (data.invoiceDueDate !== undefined) {
    dueDate =
      data.invoiceDueDate === null || String(data.invoiceDueDate).trim() === ""
        ? null
        : toCalendarDate(String(data.invoiceDueDate));
  }

  return resolveSaleInvoiceStatus({
    paymentType: nextPaymentType,
    invoiceAmountPaid: paid,
    totalAmount,
    invoiceDueDate: dueDate,
  });
}

export const salesService = {
  async list(
    userId: string,
    status?: string,
    opts?: {
      page?: number;
      limit?: number;
      sortOrder?: "ASC" | "DESC";
      dateFrom?: Date;
      dateTo?: Date;
    },
  ) {
    const where: {
      userId: string;
      status?: string;
      saleDate?: { gte?: Date; lte?: Date };
    } = { userId };
    if (status && status !== "all") where.status = status;
    if (opts?.dateFrom || opts?.dateTo) {
      where.saleDate = {};
      if (opts.dateFrom) where.saleDate.gte = opts.dateFrom;
      if (opts.dateTo) where.saleDate.lte = opts.dateTo;
    }
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";

    const [sales, total, summary, counts] = await Promise.all([
      prisma.sale.findMany({
        where,
        orderBy: [{ saleDate: order }, { createdAt: order }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({
        where,
        _sum: { amount: true, vatAmount: true, totalAmount: true },
      }),
      prisma.sale.groupBy({
        by: ["status"],
        where,
        _count: true,
      }),
    ]);
    const mappedSales = sales.map((s) => mapSaleSummary(s));
    // Prefer computed statuses for counts (Overdue flips with the calendar).
    const countByStatus = mappedSales.reduce(
      (acc, s) => {
        acc[s.status] = (acc[s.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    const paidCount =
      (countByStatus[SALE_STATUS.PAID] ?? 0) + (countByStatus["Paid"] ?? 0);
    const pendingCount = countByStatus[SALE_STATUS.PENDING] ?? 0;
    const overdueCount = countByStatus[SALE_STATUS.OVERDUE] ?? 0;
    const partialCount = countByStatus[SALE_STATUS.PARTIAL] ?? 0;
    const inProgressCount = countByStatus[SALE_STATUS.IN_PROGRESS] ?? 0;
    const cancelledCount = countByStatus[SALE_STATUS.CANCELLED] ?? 0;

    // Full-dataset counts from DB groupBy ("Paid" kept for legacy rows).
    const dbCount = (status: string) =>
      counts.find((c) => c.status === status)?._count ?? 0;
    const dbPaid = dbCount(SALE_STATUS.PAID) + dbCount("Paid");
    const dbPending = dbCount(SALE_STATUS.PENDING);
    const dbOverdue = dbCount(SALE_STATUS.OVERDUE);
    const dbPartial = dbCount(SALE_STATUS.PARTIAL);
    const dbInProgress = dbCount(SALE_STATUS.IN_PROGRESS);
    const dbCancelled = dbCount(SALE_STATUS.CANCELLED);

    return {
      summary: {
        /** Ex-VAT sales base (matches tax computation / analytics income). */
        totalIncome: decimalToNumber(summary._sum.amount),
        vatCollected: decimalToNumber(summary._sum.vatAmount),
        /** Gross including Output VAT (optional). */
        totalIncomeIncludingVat: decimalToNumber(summary._sum.totalAmount),
      },
      counts: {
        all: total,
        paid: dbPaid,
        pending: dbPending,
        overdue: dbOverdue,
        partial: dbPartial,
        inProgress: dbInProgress,
        cancelled: dbCancelled,
        /** Page-local computed counts (for UI that only shows this page). */
        page: {
          paid: paidCount,
          pending: pendingCount,
          overdue: overdueCount,
          partial: partialCount,
          inProgress: inProgressCount,
          cancelled: cancelledCount,
        },
      },
      sales: mappedSales,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getById(userId: string, saleId: string) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });
    if (!sale) return null;
    const summary = mapSaleSummary(sale);
    return {
      ...summary,
      customer: sale.customerName,
      baseAmount: decimalToNumber(sale.amount),
      vatRate: decimalToNumber(sale.vatRate),
      total: decimalToNumber(sale.totalAmount),
      vatInclusive: sale.vatInclusive,
      vatableIncome: sale.vatableIncome,
      serviceIncome: sale.serviceIncome,
    };
  },

  async create(
    userId: string,
    data: {
      amount: number;
      description: string;
      itemName?: string | null;
      receiptUrl?: string | null;
      category?: string;
      customerName?: string;
      customerId?: string;
      paymentType: string;
      date: string;
      invoiceDueDate?: string | null;
      invoiceAmountPaid?: unknown;
      bankCode?: string | null;
      vatableIncome: boolean;
      vatInclusive?: boolean;
      serviceIncome: boolean;
      createdById?: string;
    },
  ) {
    const vatInclusive = Boolean(data.vatInclusive);
    const vatableIncome = Boolean(data.vatableIncome);
    assertExclusiveVatFlags(vatableIncome, vatInclusive);
    const { amount, vatRate, vatAmount, totalAmount } = resolveSaleAmounts({
      enteredAmount: data.amount,
      vatableIncome,
      vatInclusive,
    });
    const saleDate = toCalendarDate(data.date);
    const invoiceDueDate = optionalInvoiceDueDate(data.invoiceDueDate) ?? null;
    const totalNum = Number(totalAmount);
    const settledOnCreate = isCashPaymentType(data.paymentType);
    const invoiceAmountPaid =
      data.invoiceAmountPaid != null
        ? parseAndValidateInvoiceAmountPaid(data.invoiceAmountPaid)
        : initialInvoiceAmountPaid(data.paymentType, totalNum, {
            fullyPaid: settledOnCreate,
          });
    const status = initialSaleStatusForPaymentType(data.paymentType, {
      invoiceAmountPaid,
      totalAmount: totalNum,
      invoiceDueDate,
      fullyPaid: settledOnCreate,
    });
    const settlementBankCode = await resolveSettlementBankCode(
      userId,
      data.paymentType,
      null,
      data.bankCode,
    );

    const sale = await prisma.$transaction(async (tx) => {
      const userRow = await tx.user.findUnique({
        where: { id: userId },
      });
      if (!userRow) return null;
      const nextNum =
        Number((userRow as { nextSaleNumber?: number }).nextSaleNumber) || 1;
      const invoiceNumber = String(nextNum);
      await tx.$executeRaw`
        UPDATE "User" SET next_sale_number = ${nextNum + 1} WHERE id = ${userId}
      `;
      return tx.sale.create({
        data: {
          userId,
          createdById: data.createdById ?? userId,
          invoiceNumber,
          description: data.description,
          itemName: nullableTrimmed(data.itemName),
          category: data.category ?? null,
          customerName: data.customerName?.trim() || null,
          customerId: data.customerId?.trim() || null,
          amount,
          vatInclusive,
          vatRate,
          vatAmount,
          totalAmount,
          paymentType: data.paymentType,
          saleDate,
          invoiceDueDate,
          invoiceAmountPaid: invoiceAmountPaidToJson(invoiceAmountPaid),
          vatableIncome,
          serviceIncome: data.serviceIncome,
          status,
          settlementBankCode,
          receiptUrl: nullableTrimmed(data.receiptUrl),
        },
      });
    });

    if (!sale) return null;

    await ledgerPostingService.postSaleRecognition(userId, sale);

    await taxPayablesService.syncPayablesForPeriods(userId, [
      calendarPeriodFromDate(saleDate),
    ]);

    return mapSaleSummary(sale);
  },

  async bulkCreate(
    userId: string,
    items: Array<{
      amount: number;
      description: string;
      itemName?: string | null;
      receiptUrl?: string | null;
      category?: string;
      customerName?: string;
      customerId?: string;
      paymentType?: string;
      date: string;
      invoiceDueDate?: string | null;
      invoiceAmountPaid?: unknown;
      bankCode?: string | null;
      vatableIncome?: boolean;
      vatInclusive?: boolean;
      serviceIncome?: boolean;
    }>,
    createdById?: string,
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new HttpReplyError(400, "Provide a non-empty items array");
    }
    if (items.length > BULK_CREATE_MAX) {
      throw new HttpReplyError(
        400,
        `Bulk create limited to ${BULK_CREATE_MAX} sales per request`,
      );
    }

    const prepared = items.map((raw, index) => {
      const vatableIncome = Boolean(raw.vatableIncome);
      const vatInclusive = Boolean(raw.vatInclusive);
      assertExclusiveVatFlags(vatableIncome, vatInclusive, `items[${index}]: `);
      let resolved: ReturnType<typeof resolveSaleAmounts>;
      try {
        resolved = resolveSaleAmounts({
          enteredAmount: Number(raw.amount),
          vatableIncome,
          vatInclusive,
        });
      } catch (e) {
        if (e instanceof HttpReplyError) {
          throw new HttpReplyError(
            e.statusCode,
            e.message.startsWith("items[")
              ? e.message
              : `items[${index}]: ${e.message}`,
          );
        }
        throw e;
      }
      if (!raw.description?.trim()) {
        throw new HttpReplyError(
          400,
          `items[${index}]: Description is required`,
        );
      }
      if (!raw.date) {
        throw new HttpReplyError(400, `items[${index}]: date is required`);
      }
      // Bulk: default Transfer → PAID. Card → IN_PROGRESS. Cash → PAID if provided.
      const paymentType = raw.paymentType?.trim() || PAYMENT_TYPE_TRANSFER;
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
        itemName: nullableTrimmed(raw.itemName),
        receiptUrl: nullableTrimmed(raw.receiptUrl),
        category: raw.category ?? null,
        customerName: raw.customerName?.trim() || null,
        customerId: raw.customerId?.trim() || null,
        paymentType,
        saleDate: toCalendarDate(raw.date),
        invoiceDueDate,
        invoiceAmountPaid,
        vatableIncome,
        vatInclusive,
        serviceIncome: raw.serviceIncome !== false,
        status,
        bankCode: raw.bankCode?.trim() || null,
      };
    });

    const sales = await prisma.$transaction(async (tx) => {
      const userRow = await tx.user.findUnique({ where: { id: userId } });
      if (!userRow) return null;
      let nextNum =
        Number((userRow as { nextSaleNumber?: number }).nextSaleNumber) || 1;
      const created = [];
      for (const row of prepared) {
        const settlementBankCode = await resolveSettlementBankCode(
          userId,
          row.paymentType,
          null,
          row.bankCode,
          tx,
        );
        const invoiceNumber = String(nextNum);
        nextNum += 1;
        created.push(
          await tx.sale.create({
            data: {
              userId,
              createdById: createdById ?? userId,
              invoiceNumber,
              description: row.description,
              itemName: row.itemName,
              category: row.category,
              customerName: row.customerName,
              customerId: row.customerId,
              amount: row.amount,
              vatInclusive: row.vatInclusive,
              vatRate: row.vatRate,
              vatAmount: row.vatAmount,
              totalAmount: row.totalAmount,
              paymentType: row.paymentType,
              saleDate: row.saleDate,
              invoiceDueDate: row.invoiceDueDate,
              invoiceAmountPaid: invoiceAmountPaidToJson(row.invoiceAmountPaid),
              vatableIncome: row.vatableIncome,
              serviceIncome: row.serviceIncome,
              status: row.status,
              settlementBankCode,
              receiptUrl: row.receiptUrl,
            },
          }),
        );
      }
      await tx.$executeRaw`
        UPDATE "User" SET next_sale_number = ${nextNum} WHERE id = ${userId}
      `;
      return created;
    });

    if (!sales) return null;

    for (const sale of sales) {
      await ledgerPostingService.postSaleRecognition(userId, sale, prisma, {
        settleCollectedToPaymentType: true,
      });
    }

    const periods = [
      ...new Set(
        prepared.map((p) => calendarPeriodFromDate(p.saleDate)),
      ),
    ];
    await taxPayablesService.syncPayablesForPeriods(userId, periods);

    return {
      created: sales.length,
      sales: sales.map((sale) => mapSaleSummary(sale)),
    };
  },

  async update(
    userId: string,
    saleId: string,
    data: Partial<{
      description: string;
      itemName: string | null;
      receiptUrl: string | null;
      category: string;
      customerName: string | null;
      customerId: string | null;
      amount: number;
      paymentType: string;
      date: string;
      invoiceDueDate: string | null;
      invoiceAmountPaid: unknown;
      bankCode?: string | null;
      vatableIncome: boolean;
      vatInclusive: boolean;
      serviceIncome: boolean;
      status: string;
    }>,
  ) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });
    if (!sale) return null;

    const periodsToSync = [calendarPeriodFromDate(sale.saleDate)];

    const updateData: Record<string, unknown> = {};
    if (data.description != null) updateData.description = data.description;
    if (data.itemName !== undefined) {
      updateData.itemName =
        data.itemName === null ? null : nullableTrimmed(data.itemName);
    }
    if (data.receiptUrl !== undefined) {
      updateData.receiptUrl =
        data.receiptUrl === null ? null : nullableTrimmed(data.receiptUrl);
    }
    if (data.category != null) updateData.category = data.category;
    if (data.customerName !== undefined) {
      updateData.customerName =
        data.customerName === null || data.customerName === ""
          ? null
          : data.customerName.trim();
    }
    if (data.customerId !== undefined) {
      updateData.customerId =
        data.customerId === null || data.customerId === ""
          ? null
          : data.customerId.trim();
    }
    if (data.paymentType != null) updateData.paymentType = data.paymentType;
    if (data.bankCode !== undefined) {
      updateData.settlementBankCode = data.bankCode
        ? await resolveSettlementBankCode(
            userId,
            data.paymentType ?? sale.paymentType,
            sale.settlementBankCode,
            data.bankCode,
          )
        : null;
    }
    if (data.date != null) {
      const saleDate = toCalendarDate(data.date);
      updateData.saleDate = saleDate;
      periodsToSync.push(calendarPeriodFromDate(saleDate));
    }
    if (data.invoiceDueDate !== undefined) {
      updateData.invoiceDueDate = optionalInvoiceDueDate(data.invoiceDueDate);
    }
    if (data.vatableIncome != null) updateData.vatableIncome = data.vatableIncome;
    if (data.vatInclusive != null) updateData.vatInclusive = data.vatInclusive;
    if (data.serviceIncome != null) updateData.serviceIncome = data.serviceIncome;

    const touchesFinancial =
      data.amount != null ||
      data.vatableIncome !== undefined ||
      data.vatInclusive !== undefined;

    if (touchesFinancial) {
      const vatable =
        data.vatableIncome != null ? data.vatableIncome : sale.vatableIncome;
      const vatInclusive =
        data.vatInclusive !== undefined
          ? data.vatInclusive
          : sale.vatInclusive;
      assertExclusiveVatFlags(vatable, vatInclusive);

      const enteredAmount =
        data.amount != null
          ? data.amount
          : vatInclusive
            ? decimalToNumber(sale.totalAmount)
            : decimalToNumber(sale.amount);

      const resolved = resolveSaleAmounts({
        enteredAmount,
        vatableIncome: vatable,
        vatInclusive,
      });
      updateData.amount = resolved.amount;
      updateData.vatRate = resolved.vatRate;
      updateData.vatAmount = resolved.vatAmount;
      updateData.totalAmount = resolved.totalAmount;
      updateData.vatInclusive = vatInclusive;
      updateData.vatableIncome = vatable;
    }

    const nextTotal =
      updateData.totalAmount != null
        ? Number(updateData.totalAmount as Decimal)
        : decimalToNumber(sale.totalAmount);

    const nextPaymentType = data.paymentType ?? sale.paymentType;

    // Re-apply payment defaults only when paymentType changes (not on every PATCH).
    if (data.invoiceAmountPaid != null) {
      const previousPaid = coerceInvoiceAmountPaid(sale.invoiceAmountPaid);
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

    const patchPaid =
      data.invoiceAmountPaid != null
        ? parseAndValidateInvoiceAmountPaid(data.invoiceAmountPaid)
        : updateData.invoiceAmountPaid != null
          ? coerceInvoiceAmountPaid(updateData.invoiceAmountPaid)
          : coerceInvoiceAmountPaid(sale.invoiceAmountPaid);

    updateData.status = resolveSaleStatusAfterPatch(
      sale,
      {
        ...data,
        invoiceAmountPaid: patchPaid,
      },
      nextTotal,
    );

    if (isAsyncPaymentType(nextPaymentType)) {
      updateData.paymentConfirmedAt = null;
    }

    const nextStatus = updateData.status as string;

    const nextLedgerRow = {
      ...toSaleLedgerRow(sale),
      paymentType: nextPaymentType,
      status: nextStatus,
      amount: (updateData.amount as Decimal | undefined) ?? sale.amount,
      vatAmount: (updateData.vatAmount as Decimal | undefined) ?? sale.vatAmount,
      totalAmount:
        (updateData.totalAmount as Decimal | undefined) ?? sale.totalAmount,
      invoiceAmountPaid:
        updateData.invoiceAmountPaid ?? sale.invoiceAmountPaid,
      saleDate: (updateData.saleDate as Date | undefined) ?? sale.saleDate,
      settlementBankCode:
        (updateData.settlementBankCode as string | null | undefined) ??
        sale.settlementBankCode ??
        null,
    };

    const updated = await prisma.$transaction(async (tx) => {
      await syncSaleLedgerAfterUpdate(
        userId,
        toSaleLedgerRow(sale),
        nextLedgerRow,
        tx,
      );
      return tx.sale.update({
        where: { id: saleId },
        data: updateData,
      });
    });

    await taxPayablesService.syncPayablesForPeriods(userId, periodsToSync);

    return mapSaleSummary(updated);
  },

  /**
   * Confirm a Card / Transfer sale: IN_PROGRESS → PAID.
   * Invoice sales are excluded — their status is calculated from invoiceAmountPaid.
   */
  async confirmPaymentStatus(
    userId: string,
    saleId: string,
    status: string,
    bankCode?: string | null,
  ) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });
    if (!sale) return null;

    if (!isSalePaidStatus(status)) {
      throw new HttpReplyError(
        400,
        'Only status "PAID" is accepted on payment-status',
      );
    }

    if (isInvoicePaymentType(sale.paymentType)) {
      throw new HttpReplyError(
        400,
        "Invoice sales do not use payment-status; their status is calculated from invoiceAmountPaid and invoiceDueDate (use PATCH /sales/:id with invoiceAmountPaid, or POST /sales/:id/mark-paid)",
      );
    }

    if (!isAsyncPaymentType(sale.paymentType)) {
      throw new HttpReplyError(
        400,
        "payment-status applies only to Card or Transfer sales",
      );
    }

    if (isSalePaidStatus(sale.status)) {
      return mapSaleSummary(sale);
    }

    if (sale.status !== SALE_STATUS.IN_PROGRESS) {
      throw new HttpReplyError(
        400,
        "Only IN_PROGRESS sales can be confirmed as PAID",
      );
    }

    const paid = invoiceAmountPaidFromSingle(
      decimalToNumber(sale.totalAmount),
      sale.paymentType,
    );

    const updated = await prisma.$transaction(async (tx) => {
      const settlementBankCode = await resolveSettlementBankCode(
        userId,
        sale.paymentType,
        sale.settlementBankCode,
        bankCode,
        tx,
      );

      const row = await tx.sale.update({
        where: { id: saleId },
        data: {
          invoiceAmountPaid: invoiceAmountPaidToJson(paid),
          status: SALE_STATUS.PAID,
          paymentConfirmedAt: new Date(),
          settlementBankCode,
        },
      });

      await ledgerPostingService.postSaleCollection(
        userId,
        saleId,
        decimalToNumber(row.totalAmount),
        row.paymentType,
        row.saleDate,
        "confirm",
        settlementBankCode,
        tx,
      );

      return row;
    });

    return mapSaleSummary(updated);
  },

  /** Invoice sales: settle in full (invoiceAmountPaid.total = totalAmount → PAID). */
  async markInvoicePaid(
    userId: string,
    saleId: string,
    bankCode?: string | null,
  ) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });
    if (!sale) return null;

    if (!isInvoicePaymentType(sale.paymentType)) {
      throw new HttpReplyError(
        400,
        "mark-paid applies only to sales with paymentType Invoice",
      );
    }

    if (isSalePaidStatus(resolveSaleInvoiceStatus(sale))) {
      return mapSaleSummary(sale);
    }

    const total = decimalToNumber(sale.totalAmount);
    const settlementBankCode = await resolveSettlementBankCode(
      userId,
      PAYMENT_TYPE_TRANSFER,
      sale.settlementBankCode,
      bankCode ?? sale.settlementBankCode,
    );
    const paid = invoiceAmountPaidFromSingle(total, PAYMENT_TYPE_TRANSFER);

    const updated = await prisma.$transaction(async (tx) => {
      const nextLedgerRow = {
        ...toSaleLedgerRow(sale),
        invoiceAmountPaid: invoiceAmountPaidToJson(paid),
        status: SALE_STATUS.PAID,
        settlementBankCode,
      };

      await syncSaleLedgerAfterUpdate(
        userId,
        toSaleLedgerRow(sale),
        nextLedgerRow,
        tx,
      );

      return tx.sale.update({
        where: { id: saleId },
        data: {
          invoiceAmountPaid: invoiceAmountPaidToJson(paid),
          status: SALE_STATUS.PAID,
          paymentConfirmedAt: new Date(),
          settlementBankCode,
        },
      });
    });

    return mapSaleSummary(updated);
  },

  async deleteForUser(userId: string, saleId: string): Promise<boolean> {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });
    if (!sale) return false;
    const period = calendarPeriodFromDate(sale.saleDate);

    const deleted = await prisma.$transaction(async (tx) => {
      await reverseSaleLedgerOnDelete(userId, toSaleLedgerRow(sale), tx);
      const result = await tx.sale.deleteMany({
        where: { id: saleId, userId },
      });
      return result.count > 0;
    });

    if (deleted) {
      await taxPayablesService.syncPayablesForPeriods(userId, [period]);
    }
    return deleted;
  },
};
