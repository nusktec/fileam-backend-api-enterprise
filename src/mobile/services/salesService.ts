import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import { PERCENT, VAT_RATE_PERCENT } from "../../constants/percentages";
import {
  initialSaleStatusForPaymentType,
  isAsyncPaymentType,
  isCashPaymentType,
  isInvoicePaymentType,
  isSalePaidStatus,
  SALE_STATUS,
} from "../../constants/salePaymentRules";
import { HttpReplyError } from "../../utils/httpReplyError";
import { assertMonetaryAmountInRange } from "../../utils/monetaryAmount";
import {
  calendarPeriodFromDate,
  toCalendarDate,
} from "../../utils/dateRangeQuery";
import { taxPayablesService } from "./taxPayablesService";

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

function assertSaleFinancials(
  amount: Decimal,
  vatAmount: Decimal,
  totalAmount: Decimal,
): void {
  assertMonetaryAmountInRange(Number(amount), "Amount");
  assertMonetaryAmountInRange(Number(vatAmount), "VAT amount");
  assertMonetaryAmountInRange(Number(totalAmount), "Total amount");
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
}) {
  return {
    id: sale.id,
    invoiceNumber: sale.invoiceNumber,
    status: sale.status,
    description: sale.description,
    itemName: sale.itemName ?? null,
    date: sale.saleDate,
    amount: decimalToNumber(sale.amount),
    vatAmount: decimalToNumber(sale.vatAmount),
    totalAmount: decimalToNumber(sale.totalAmount),
    customerName: sale.customerName ?? null,
    customerId: sale.customerId ?? null,
    receiptUrl: sale.receiptUrl ?? null,
    paymentType: sale.paymentType,
    paymentConfirmedAt: sale.paymentConfirmedAt
      ? sale.paymentConfirmedAt.toISOString()
      : null,
  };
}

function resolveSaleStatusAfterPatch(
  sale: { paymentType: string; status: string },
  data: Partial<{ paymentType: string; status: string }>,
): string {
  const effectivePt = data.paymentType ?? sale.paymentType;

  if (isInvoicePaymentType(effectivePt)) {
    if (data.status != null) {
      const allowed = [
        SALE_STATUS.PAID,
        "Paid",
        SALE_STATUS.PENDING,
        SALE_STATUS.OVERDUE,
      ];
      if (!allowed.includes(data.status)) {
        throw new HttpReplyError(
          400,
          `status must be one of: Pending, Overdue, PAID for Invoice sales`,
        );
      }
      const normalized =
        data.status === "Paid" ? SALE_STATUS.PAID : data.status;
      if (
        normalized === SALE_STATUS.PENDING &&
        isSalePaidStatus(sale.status)
      ) {
        throw new HttpReplyError(
          400,
          "Paid sales cannot be set back to Pending",
        );
      }
      if (
        isSalePaidStatus(normalized) &&
        ![
          SALE_STATUS.PENDING,
          SALE_STATUS.OVERDUE,
          SALE_STATUS.PAID,
          "Paid",
        ].includes(sale.status)
      ) {
        throw new HttpReplyError(
          400,
          "Only Pending or Overdue invoice sales can be marked Paid via status",
        );
      }
      return isSalePaidStatus(normalized) ? SALE_STATUS.PAID : normalized;
    }

    if (
      data.paymentType != null &&
      data.paymentType !== sale.paymentType &&
      isInvoicePaymentType(data.paymentType)
    ) {
      return SALE_STATUS.PENDING;
    }

    return sale.status;
  }

  // Cash / Card / Transfer — payment-status endpoint confirms Card/Transfer.
  // PATCH status is not the primary confirm path for async payments.
  if (data.status != null) {
    if (data.status === SALE_STATUS.CANCELLED) {
      return SALE_STATUS.CANCELLED;
    }
    if (isSalePaidStatus(data.status) || data.status === SALE_STATUS.IN_PROGRESS) {
      throw new HttpReplyError(
        400,
        "Use PATCH /sales/:id/payment-status to confirm Card/Transfer payments (IN_PROGRESS → PAID)",
      );
    }
    throw new HttpReplyError(
      400,
      `Invalid status for ${effectivePt} sales`,
    );
  }

  if (data.paymentType != null && data.paymentType !== sale.paymentType) {
    if (isCashPaymentType(data.paymentType)) return SALE_STATUS.PAID;
    if (isAsyncPaymentType(data.paymentType)) {
      return isSalePaidStatus(sale.status)
        ? SALE_STATUS.PAID
        : SALE_STATUS.IN_PROGRESS;
    }
  }

  return sale.status;
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
    const countByStatus = counts.reduce(
      (acc, c) => {
        acc[c.status] = c._count;
        return acc;
      },
      {} as Record<string, number>,
    );
    const paidCount =
      (countByStatus[SALE_STATUS.PAID] ?? 0) + (countByStatus["Paid"] ?? 0);
    const pendingCount = countByStatus[SALE_STATUS.PENDING] ?? 0;
    const overdueCount = countByStatus[SALE_STATUS.OVERDUE] ?? 0;
    const inProgressCount = countByStatus[SALE_STATUS.IN_PROGRESS] ?? 0;
    const cancelledCount = countByStatus[SALE_STATUS.CANCELLED] ?? 0;
    const totalCount =
      paidCount +
      pendingCount +
      overdueCount +
      inProgressCount +
      cancelledCount;

    return {
      summary: {
        /** Ex-VAT sales base (matches tax computation / analytics income). */
        totalIncome: decimalToNumber(summary._sum.amount),
        vatCollected: decimalToNumber(summary._sum.vatAmount),
        /** Gross including Output VAT (optional). */
        totalIncomeIncludingVat: decimalToNumber(summary._sum.totalAmount),
      },
      counts: {
        all: totalCount,
        paid: paidCount,
        pending: pendingCount,
        overdue: overdueCount,
        inProgress: inProgressCount,
        cancelled: cancelledCount,
      },
      sales: sales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        status: s.status,
        description: s.description,
        itemName: s.itemName ?? null,
        category: s.category ?? null,
        date: s.saleDate,
        amount: decimalToNumber(s.amount),
        vatAmount: decimalToNumber(s.vatAmount),
        totalAmount: decimalToNumber(s.totalAmount),
        customerName: s.customerName ?? null,
        customerId: s.customerId ?? null,
        receiptUrl: s.receiptUrl ?? null,
        paymentType: s.paymentType,
        paymentConfirmedAt: s.paymentConfirmedAt
          ? s.paymentConfirmedAt.toISOString()
          : null,
      })),
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
    return {
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      status: sale.status,
      totalAmount: decimalToNumber(sale.totalAmount),
      description: sale.description,
      itemName: sale.itemName ?? null,
      category: sale.category ?? null,
      customer: sale.customerName,
      customerName: sale.customerName ?? null,
      customerId: sale.customerId ?? null,
      receiptUrl: sale.receiptUrl ?? null,
      paymentType: sale.paymentType,
      date: sale.saleDate,
      baseAmount: decimalToNumber(sale.amount),
      vatRate: decimalToNumber(sale.vatRate),
      vatAmount: decimalToNumber(sale.vatAmount),
      total: decimalToNumber(sale.totalAmount),
      vatableIncome: sale.vatableIncome,
      serviceIncome: sale.serviceIncome,
      paymentConfirmedAt: sale.paymentConfirmedAt
        ? sale.paymentConfirmedAt.toISOString()
        : null,
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
      vatableIncome: boolean;
      serviceIncome: boolean;
      createdById?: string;
    },
  ) {
    const amount = new Decimal(data.amount);
    const vatRate = data.vatableIncome
      ? new Decimal(VAT_RATE_PERCENT)
      : new Decimal(0);
    const vatAmount = data.vatableIncome
      ? amount.mul(VAT_RATE_PERCENT / PERCENT)
      : new Decimal(0);
    const totalAmount = amount.add(vatAmount);
    assertSaleFinancials(amount, vatAmount, totalAmount);
    const status = initialSaleStatusForPaymentType(data.paymentType);
    const saleDate = toCalendarDate(data.date);

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
          vatRate,
          vatAmount,
          totalAmount,
          paymentType: data.paymentType,
          saleDate,
          vatableIncome: data.vatableIncome,
          serviceIncome: data.serviceIncome,
          status,
          receiptUrl: nullableTrimmed(data.receiptUrl),
        },
      });
    });

    if (!sale) return null;

    await taxPayablesService.syncPayablesForPeriods(userId, [
      calendarPeriodFromDate(saleDate),
    ]);

    return {
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      status: sale.status,
      description: sale.description,
      itemName: sale.itemName ?? null,
      date: sale.saleDate,
      amount: decimalToNumber(sale.amount),
      vatAmount: decimalToNumber(sale.vatAmount),
      totalAmount: decimalToNumber(sale.totalAmount),
      customerName: sale.customerName ?? null,
      customerId: sale.customerId ?? null,
      receiptUrl: sale.receiptUrl ?? null,
      paymentType: sale.paymentType,
      paymentConfirmedAt: null,
    };
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
      paymentType: string;
      date: string;
      vatableIncome?: boolean;
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
      const amount = new Decimal(raw.amount);
      const vatableIncome = Boolean(raw.vatableIncome);
      const serviceIncome = raw.serviceIncome !== false;
      const vatRate = vatableIncome
        ? new Decimal(VAT_RATE_PERCENT)
        : new Decimal(0);
      const vatAmount = vatableIncome
        ? amount.mul(VAT_RATE_PERCENT / PERCENT)
        : new Decimal(0);
      const totalAmount = amount.add(vatAmount);
      try {
        assertSaleFinancials(amount, vatAmount, totalAmount);
      } catch (e) {
        if (e instanceof HttpReplyError) {
          throw new HttpReplyError(
            e.statusCode,
            `items[${index}]: ${e.message}`,
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
      if (!raw.paymentType?.trim()) {
        throw new HttpReplyError(
          400,
          `items[${index}]: paymentType is required`,
        );
      }
      if (!raw.date) {
        throw new HttpReplyError(400, `items[${index}]: date is required`);
      }
      return {
        amount,
        vatRate,
        vatAmount,
        totalAmount,
        description: raw.description.trim(),
        itemName: nullableTrimmed(raw.itemName),
        receiptUrl: nullableTrimmed(raw.receiptUrl),
        category: raw.category ?? null,
        customerName: raw.customerName?.trim() || null,
        customerId: raw.customerId?.trim() || null,
        paymentType: raw.paymentType,
        saleDate: toCalendarDate(raw.date),
        vatableIncome,
        serviceIncome,
        status: initialSaleStatusForPaymentType(raw.paymentType),
      };
    });

    const sales = await prisma.$transaction(async (tx) => {
      const userRow = await tx.user.findUnique({ where: { id: userId } });
      if (!userRow) return null;
      let nextNum =
        Number((userRow as { nextSaleNumber?: number }).nextSaleNumber) || 1;
      const created = [];
      for (const row of prepared) {
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
              vatRate: row.vatRate,
              vatAmount: row.vatAmount,
              totalAmount: row.totalAmount,
              paymentType: row.paymentType,
              saleDate: row.saleDate,
              vatableIncome: row.vatableIncome,
              serviceIncome: row.serviceIncome,
              status: row.status,
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

    const periods = [
      ...new Set(
        prepared.map((p) => calendarPeriodFromDate(p.saleDate)),
      ),
    ];
    await taxPayablesService.syncPayablesForPeriods(userId, periods);

    return {
      created: sales.length,
      sales: sales.map((sale) => ({
        id: sale.id,
        invoiceNumber: sale.invoiceNumber,
        status: sale.status,
        description: sale.description,
        itemName: sale.itemName ?? null,
        date: sale.saleDate,
        amount: decimalToNumber(sale.amount),
        vatAmount: decimalToNumber(sale.vatAmount),
        totalAmount: decimalToNumber(sale.totalAmount),
        customerName: sale.customerName ?? null,
        customerId: sale.customerId ?? null,
        receiptUrl: sale.receiptUrl ?? null,
        paymentType: sale.paymentType,
        paymentConfirmedAt: null,
      })),
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
      vatableIncome: boolean;
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
    if (data.date != null) {
      const saleDate = toCalendarDate(data.date);
      updateData.saleDate = saleDate;
      periodsToSync.push(calendarPeriodFromDate(saleDate));
    }
    if (data.vatableIncome != null) updateData.vatableIncome = data.vatableIncome;
    if (data.serviceIncome != null) updateData.serviceIncome = data.serviceIncome;

    const vatable =
      data.vatableIncome != null ? data.vatableIncome : sale.vatableIncome;

    if (data.amount != null) {
      const amount = new Decimal(data.amount);
      const vatRate = (vatable ? VAT_RATE_PERCENT : 0) / PERCENT;
      const vatAmount = amount.mul(vatRate);
      const totalAmount = amount.add(vatAmount);
      assertSaleFinancials(amount, vatAmount, totalAmount);
      updateData.amount = amount;
      updateData.vatRate = new Decimal(vatable ? VAT_RATE_PERCENT : 0);
      updateData.vatAmount = vatAmount;
      updateData.totalAmount = totalAmount;
    } else if (data.vatableIncome != null) {
      const amount = new Decimal(sale.amount);
      const vatRate = (vatable ? VAT_RATE_PERCENT : 0) / PERCENT;
      const vatAmount = amount.mul(vatRate);
      const totalAmount = amount.add(vatAmount);
      assertSaleFinancials(amount, vatAmount, totalAmount);
      updateData.vatRate = new Decimal(vatable ? VAT_RATE_PERCENT : 0);
      updateData.vatAmount = vatAmount;
      updateData.totalAmount = totalAmount;
    }

    updateData.status = resolveSaleStatusAfterPatch(sale, data);

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: updateData,
    });

    await taxPayablesService.syncPayablesForPeriods(userId, periodsToSync);

    return {
      id: updated.id,
      invoiceNumber: updated.invoiceNumber,
      status: updated.status,
      description: updated.description,
      itemName: updated.itemName ?? null,
      date: updated.saleDate,
      amount: decimalToNumber(updated.amount),
      vatAmount: decimalToNumber(updated.vatAmount),
      totalAmount: decimalToNumber(updated.totalAmount),
      customerName: updated.customerName ?? null,
      customerId: updated.customerId ?? null,
      receiptUrl: updated.receiptUrl ?? null,
      paymentType: updated.paymentType,
      paymentConfirmedAt: updated.paymentConfirmedAt
        ? updated.paymentConfirmedAt.toISOString()
        : null,
    };
  },

  /**
   * Confirm Card/Transfer payment: IN_PROGRESS → PAID.
   * Invoice sales continue to use POST /sales/:id/mark-paid.
   */
  async confirmPaymentStatus(
    userId: string,
    saleId: string,
    status: string,
  ) {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
    });
    if (!sale) return null;

    if (status !== SALE_STATUS.PAID) {
      throw new HttpReplyError(
        400,
        'Only status "PAID" is accepted on payment-status',
      );
    }

    if (isInvoicePaymentType(sale.paymentType)) {
      throw new HttpReplyError(
        400,
        "Invoice sales use POST /sales/:id/mark-paid (Pending → Paid)",
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

    const confirmedAt = new Date();
    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: {
        status: SALE_STATUS.PAID,
        paymentConfirmedAt: confirmedAt,
      },
    });

    return mapSaleSummary(updated);
  },

  async markInvoicePaid(userId: string, saleId: string) {
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

    if (isSalePaidStatus(sale.status)) {
      return mapSaleSummary({
        ...sale,
        status: SALE_STATUS.PAID,
      });
    }

    if (
      ![SALE_STATUS.PENDING, SALE_STATUS.OVERDUE].includes(
        sale.status as typeof SALE_STATUS.PENDING,
      )
    ) {
      throw new HttpReplyError(
        400,
        "Only Pending or Overdue invoice sales can be marked Paid",
      );
    }

    const confirmedAt = new Date();
    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: {
        status: SALE_STATUS.PAID,
        paymentConfirmedAt: confirmedAt,
      },
    });

    return mapSaleSummary(updated);
  },

  async deleteForUser(userId: string, saleId: string): Promise<boolean> {
    const sale = await prisma.sale.findFirst({
      where: { id: saleId, userId },
      select: { saleDate: true },
    });
    if (!sale) return false;
    const period = calendarPeriodFromDate(sale.saleDate);
    const result = await prisma.sale.deleteMany({
      where: { id: saleId, userId },
    });
    if (result.count > 0) {
      await taxPayablesService.syncPayablesForPeriods(userId, [period]);
    }
    return result.count > 0;
  },
};
