import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function periodLabel(year: number, month: number): string {
  return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
}

export type FilingDisplayStatus = "overdue" | "submitted" | "paid" | "pending";

function deriveDisplayStatus(payable: {
  status: string;
  submittedAt: Date | null;
  filingDueDate: Date;
  totalPayable: number;
  totalPaid: number;
}): FilingDisplayStatus {
  if (payable.status === "paid" || payable.status === "overpaid") return "paid";
  if (payable.totalPaid >= payable.totalPayable && payable.totalPayable > 0)
    return "paid";
  if (payable.submittedAt) return "submitted";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(payable.filingDueDate);
  due.setHours(0, 0, 0, 0);
  if (due < today) return "overdue";
  return "pending";
}

export const filingsService = {
  async list(
    userId: string,
    filters?: { status?: string; taxType?: string },
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
      taxType?: string;
      filingDueDate?: { gte?: Date; lte?: Date };
    } = { userId };
    if (filters?.taxType) where.taxType = filters.taxType;
    if (opts?.dateFrom || opts?.dateTo) {
      where.filingDueDate = {};
      if (opts.dateFrom) where.filingDueDate.gte = opts.dateFrom;
      if (opts.dateTo) where.filingDueDate.lte = opts.dateTo;
    }
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";

    const [payables, total] = await Promise.all([
      prisma.taxPayable.findMany({
        where,
        orderBy: [{ periodYear: order }, { periodMonth: order }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          payments: {
            where: { status: "completed" },
            orderBy: { paidAt: "desc" },
          },
        },
      }),
      prisma.taxPayable.count({ where }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let items = payables.map((p) => {
      const totalPayable = decimalToNumber(p.totalPayable);
      const totalPaid = p.payments.reduce(
        (s, r) => s + decimalToNumber(r.amountPaid),
        0,
      );
      const displayStatus = deriveDisplayStatus({
        status: p.status,
        submittedAt: p.submittedAt,
        filingDueDate: p.filingDueDate,
        totalPayable,
        totalPaid,
      });
      return {
        id: p.id,
        taxType: p.taxType,
        periodYear: p.periodYear,
        periodMonth: p.periodMonth,
        periodLabel: periodLabel(p.periodYear, p.periodMonth),
        amount: totalPayable,
        status: displayStatus,
        dueDate: p.filingDueDate,
        submittedDate: p.submittedAt ?? undefined,
      };
    });

    const statusFilter = (filters?.status || "").toLowerCase();
    if (statusFilter && statusFilter !== "all") {
      items = items.filter((i) => i.status === statusFilter);
    }
    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getById(userId: string, filingId: string) {
    const p = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId },
      include: {
        payments: {
          where: { status: "completed" },
          orderBy: { paidAt: "desc" },
        },
        timeline: { orderBy: { eventDate: "asc" } },
      },
    });
    if (!p) return null;

    const totalPayable = decimalToNumber(p.totalPayable);
    const totalPaid = p.payments.reduce(
      (s, r) => s + decimalToNumber(r.amountPaid),
      0,
    );
    const displayStatus = deriveDisplayStatus({
      status: p.status,
      submittedAt: p.submittedAt,
      filingDueDate: p.filingDueDate,
      totalPayable,
      totalPaid,
    });

    return {
      id: p.id,
      taxType: p.taxType,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      periodLabel: periodLabel(p.periodYear, p.periodMonth),
      amount: totalPayable,
      status: displayStatus,
      dueDate: p.filingDueDate,
      submittedAt: p.submittedAt ?? undefined,
      documentUrl: p.documentUrl ?? undefined,
      evidenceVaultId: p.evidenceVaultId ?? undefined,
      stateOfOperation: p.stateOfOperation ?? undefined,
      vatRegistrationNumber: p.vatRegistrationNumber ?? undefined,
      receiptUrl: p.receiptUrl ?? undefined,
      totalPaid,
      currency: p.currency,
      timeline: p.timeline.map((e) => ({
        id: e.id,
        event: e.event,
        description: e.description ?? undefined,
        eventDate: e.eventDate ?? undefined,
        createdAt: e.createdAt,
      })),
    };
  },

  async getDocumentUrl(
    userId: string,
    filingId: string,
  ): Promise<string | null> {
    const p = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId },
      select: { documentUrl: true },
    });
    return p?.documentUrl ?? null;
  },

  async getVaultLink(userId: string, filingId: string): Promise<string | null> {
    const p = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId },
      select: { evidenceVaultId: true },
    });
    return p?.evidenceVaultId ?? null;
  },

  async update(
    userId: string,
    filingId: string,
    data: Partial<{
      status: string;
      documentUrl: string;
      submittedAt: string | Date | null;
      receiptUrl: string;
    }>,
  ) {
    const p = await prisma.taxPayable.findFirst({
      where: { id: filingId, userId },
    });
    if (!p) return null;

    const updateData: Record<string, unknown> = {};
    if (data.status != null) updateData.status = data.status;
    if (data.documentUrl != null) updateData.documentUrl = data.documentUrl;
    if (data.receiptUrl != null) updateData.receiptUrl = data.receiptUrl;
    if (data.submittedAt !== undefined) {
      updateData.submittedAt = data.submittedAt
        ? new Date(data.submittedAt)
        : null;
    }

    await prisma.taxPayable.update({
      where: { id: filingId },
      data: updateData,
    });
    return this.getById(userId, filingId);
  },
};
