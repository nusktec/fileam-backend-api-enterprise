import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";

const VAT_RATE = 7.5;
const EXPENSE_COUNTER_ID = "expense_number";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
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
        orderBy: { saleDate: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.sale.count({ where }),
      prisma.sale.aggregate({
        where,
        _sum: { totalAmount: true, vatAmount: true },
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
    const paidCount = countByStatus["Paid"] ?? 0;
    const pendingCount = countByStatus["Pending"] ?? 0;
    const overdueCount = countByStatus["Overdue"] ?? 0;
    const totalCount = paidCount + pendingCount + overdueCount;

    return {
      summary: {
        totalIncome: decimalToNumber(summary._sum.totalAmount),
        vatCollected: decimalToNumber(summary._sum.vatAmount),
      },
      counts: {
        all: totalCount,
        paid: paidCount,
        pending: pendingCount,
        overdue: overdueCount,
      },
      sales: sales.map((s) => ({
        id: s.id,
        invoiceNumber: s.invoiceNumber,
        status: s.status,
        description: s.description,
        category: s.category ?? null,
        date: s.saleDate,
        amount: decimalToNumber(s.amount),
        vatAmount: decimalToNumber(s.vatAmount),
        totalAmount: decimalToNumber(s.totalAmount),
        customerName: s.customerName ?? null,
        customerId: s.customerId ?? null,
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
      category: sale.category ?? null,
      customer: sale.customerName,
      customerName: sale.customerName ?? null,
      customerId: sale.customerId ?? null,
      paymentType: sale.paymentType,
      date: sale.saleDate,
      baseAmount: decimalToNumber(sale.amount),
      vatRate: decimalToNumber(sale.vatRate),
      vatAmount: decimalToNumber(sale.vatAmount),
      total: decimalToNumber(sale.totalAmount),
      vatableIncome: sale.vatableIncome,
      serviceIncome: sale.serviceIncome,
    };
  },

  async create(
    userId: string,
    data: {
      amount: number;
      description: string;
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
    const vatRate = data.vatableIncome ? new Decimal(VAT_RATE) : new Decimal(0);
    const vatAmount = data.vatableIncome
      ? amount.mul(VAT_RATE / 100)
      : new Decimal(0);
    const totalAmount = amount.add(vatAmount);

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
          category: data.category ?? null,
          customerName: data.customerName?.trim() || null,
          customerId: data.customerId?.trim() || null,
          amount,
          vatRate,
          vatAmount,
          totalAmount,
          paymentType: data.paymentType,
          saleDate: new Date(data.date),
          vatableIncome: data.vatableIncome,
          serviceIncome: data.serviceIncome,
          status: "Pending",
        },
      });
    });

    if (!sale) return null;

    return {
      id: sale.id,
      invoiceNumber: sale.invoiceNumber,
      status: sale.status,
      description: sale.description,
      date: sale.saleDate,
      amount: decimalToNumber(sale.amount),
      vatAmount: decimalToNumber(sale.vatAmount),
      totalAmount: decimalToNumber(sale.totalAmount),
      customerName: sale.customerName ?? null,
      customerId: sale.customerId ?? null,
    };
  },

  async update(
    userId: string,
    saleId: string,
    data: Partial<{
      description: string;
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

    const updateData: Record<string, unknown> = {};
    if (data.description != null) updateData.description = data.description;
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
    if (data.date != null) updateData.saleDate = new Date(data.date);
    if (data.vatableIncome != null) updateData.vatableIncome = data.vatableIncome;
    if (data.serviceIncome != null) updateData.serviceIncome = data.serviceIncome;
    if (data.status != null) updateData.status = data.status;

    if (data.amount != null) {
      const amount = new Decimal(data.amount);
      const vatRate = (sale.vatableIncome ? VAT_RATE : 0) / 100;
      const vatAmount = amount.mul(vatRate);
      updateData.amount = amount;
      updateData.vatAmount = vatAmount;
      updateData.totalAmount = amount.add(vatAmount);
    }

    const updated = await prisma.sale.update({
      where: { id: saleId },
      data: updateData,
    });
    return {
      id: updated.id,
      invoiceNumber: updated.invoiceNumber,
      status: updated.status,
      description: updated.description,
      date: updated.saleDate,
      amount: decimalToNumber(updated.amount),
      vatAmount: decimalToNumber(updated.vatAmount),
      totalAmount: decimalToNumber(updated.totalAmount),
      customerName: updated.customerName ?? null,
      customerId: updated.customerId ?? null,
    };
  },
};
