import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import type {
  PaymentMethod,
  PaymentRecordStatus,
} from "../../constants/taxPayable";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function derivePayableStatus(
  totalPayable: number,
  totalPaid: number,
): "pending" | "paid" | "overpaid" | "partially_paid" {
  if (totalPaid <= 0) return "pending";
  if (totalPaid >= totalPayable)
    return totalPaid > totalPayable ? "overpaid" : "paid";
  return "partially_paid";
}

export const paymentRecordsService = {
  async createRecord(
    taxPayableId: string,
    userId: string,
    data: {
      amountPaid: number;
      currency?: string;
      externalReference?: string;
      externalPaymentId?: string;
      method: PaymentMethod;
      status?: PaymentRecordStatus;
      paidAt?: Date;
      metadata?: Record<string, unknown>;
    },
  ) {
    const taxPayable = await prisma.taxPayable.findFirst({
      where: { id: taxPayableId, userId },
      include: { payments: { where: { status: "completed" } } },
    });
    if (!taxPayable) return null;

    const record = await prisma.paymentRecord.create({
      data: {
        taxPayableId,
        userId,
        amountPaid: new Decimal(data.amountPaid),
        currency: data.currency ?? "NGN",
        externalReference: data.externalReference ?? null,
        externalPaymentId: data.externalPaymentId ?? null,
        method: data.method,
        status: data.status ?? "completed",
        paidAt:
          data.paidAt ?? (data.status === "completed" ? new Date() : null),
        metadata:
          data.metadata != null
            ? (data.metadata as Prisma.InputJsonValue)
            : undefined,
      },
    });

    const totalPayable = decimalToNumber(taxPayable.totalPayable);
    const previousPaid = taxPayable.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
    const newTotalPaid = previousPaid + data.amountPaid;
    const status = derivePayableStatus(totalPayable, newTotalPaid);

    await prisma.taxPayable.update({
      where: { id: taxPayableId },
      data: { status },
    });

    return {
      id: record.id,
      taxPayableId: record.taxPayableId,
      amountPaid: data.amountPaid,
      currency: record.currency,
      method: record.method,
      status: record.status,
      externalReference: record.externalReference,
      paidAt: record.paidAt,
    };
  },

  async list(
    userId: string,
    filters?: { taxPayableId?: string; status?: string },
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
      taxPayableId?: string;
      status?: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = {
      userId,
    };
    if (filters?.taxPayableId) where.taxPayableId = filters.taxPayableId;
    if (filters?.status) where.status = filters.status;
    if (opts?.dateFrom || opts?.dateTo) {
      where.createdAt = {};
      if (opts.dateFrom) where.createdAt.gte = opts.dateFrom;
      if (opts.dateTo) where.createdAt.lte = opts.dateTo;
    }
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";

    const [records, total] = await Promise.all([
      prisma.paymentRecord.findMany({
        where,
        orderBy: { createdAt: order },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          taxPayable: {
            select: {
              id: true,
              taxType: true,
              periodYear: true,
              periodMonth: true,
            },
          },
        },
      }),
      prisma.paymentRecord.count({ where }),
    ]);

    return {
      data: records.map((r) => ({
        id: r.id,
        taxPayableId: r.taxPayableId,
        taxType: r.taxPayable.taxType,
        periodLabel: `${new Date(r.taxPayable.periodYear, r.taxPayable.periodMonth - 1).toLocaleString("default", { month: "long" })} ${r.taxPayable.periodYear}`,
        amountPaid: decimalToNumber(r.amountPaid),
        currency: r.currency,
        method: r.method,
        status: r.status,
        externalReference: r.externalReference,
        paidAt: r.paidAt,
        createdAt: r.createdAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getById(userId: string, recordId: string) {
    const r = await prisma.paymentRecord.findFirst({
      where: { id: recordId, userId },
      include: { taxPayable: true },
    });
    if (!r) return null;
    return {
      id: r.id,
      taxPayableId: r.taxPayableId,
      taxType: r.taxPayable.taxType,
      periodYear: r.taxPayable.periodYear,
      periodMonth: r.taxPayable.periodMonth,
      periodLabel: `${new Date(r.taxPayable.periodYear, r.taxPayable.periodMonth - 1).toLocaleString("default", { month: "long" })} ${r.taxPayable.periodYear}`,
      amountPaid: decimalToNumber(r.amountPaid),
      currency: r.currency,
      method: r.method,
      status: r.status,
      externalReference: r.externalReference,
      externalPaymentId: r.externalPaymentId,
      paidAt: r.paidAt,
      createdAt: r.createdAt,
      totalPayable: decimalToNumber(r.taxPayable.totalPayable),
    };
  },

  async findByExternalReference(externalReference: string) {
    return prisma.paymentRecord.findFirst({
      where: { externalReference },
    });
  },
};
