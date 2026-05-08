import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { taxComputationService } from "./taxComputationService";
import {
  VAT_FILING_DAY,
  TAX_PAYABLES_SCOPE_NOTE,
  type TaxType,
  type PayableStatus,
} from "../../constants/taxPayable";

const PAYMENT_BASE_URL =
  process.env.PAYMENT_BASE_URL || "https://pay.fileam.app";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

/** Placeholder payment link until a payment provider is integrated. */
function getPaymentLink(payableId: string, storedLink: string | null): string {
  return storedLink ?? `${PAYMENT_BASE_URL}/checkout/${payableId}`;
}

function getFilingDueDate(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, VAT_FILING_DAY);
}

function derivePayableStatus(
  totalPayable: number,
  totalPaid: number,
): PayableStatus {
  if (totalPaid <= 0) return "pending";
  if (totalPaid >= totalPayable)
    return totalPaid > totalPayable ? "overpaid" : "paid";
  return "partially_paid";
}

export const taxPayablesService = {
  async ensurePayablesForUser(userId: string, monthsBack = 12) {
    const now = new Date();
    const payablesToUpsert: Array<{
      taxType: TaxType;
      year: number;
      month: number;
      amountDue: number;
      penalties: number;
    }> = [];

    for (let i = 0; i <= monthsBack; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const year = d.getFullYear();
      const month = d.getMonth() + 1;
      const computation = await taxComputationService.getForPeriod(
        userId,
        year,
        month,
      );

      if (computation.vat.netVatPayable > 0) {
        payablesToUpsert.push({
          taxType: "VAT",
          year,
          month,
          amountDue: computation.vat.netVatPayable,
          penalties: 0,
        });
      }
      if (computation.wht.estimatedWhtDeducted > 0) {
        payablesToUpsert.push({
          taxType: "WHT",
          year,
          month,
          amountDue: computation.wht.estimatedWhtDeducted,
          penalties: 0,
        });
      }
      if (computation.cit.summary > 0) {
        payablesToUpsert.push({
          taxType: "CIT",
          year,
          month,
          amountDue: computation.cit.summary / 12,
          penalties: 0,
        });
      }
      if (computation.pit.summary > 0) {
        payablesToUpsert.push({
          taxType: "PIT",
          year,
          month,
          amountDue: computation.pit.summary / 12,
          penalties: 0,
        });
      }
      if (computation.paye.summaryMonthlyEstimate > 0) {
        payablesToUpsert.push({
          taxType: "PAYE",
          year,
          month,
          amountDue: computation.paye.summaryMonthlyEstimate,
          penalties: 0,
        });
      }
    }

    for (const p of payablesToUpsert) {
      const totalPayable = p.amountDue + p.penalties;
      const filingDueDate = getFilingDueDate(p.year, p.month);
      await prisma.taxPayable.upsert({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId,
            taxType: p.taxType,
            periodYear: p.year,
            periodMonth: p.month,
          },
        },
        create: {
          userId,
          taxType: p.taxType,
          periodYear: p.year,
          periodMonth: p.month,
          amountDue: new Decimal(p.amountDue),
          penalties: new Decimal(p.penalties),
          totalPayable: new Decimal(totalPayable),
          filingDueDate,
          status: "pending",
        },
        update: {
          amountDue: new Decimal(p.amountDue),
          penalties: new Decimal(p.penalties),
          totalPayable: new Decimal(totalPayable),
        },
      });
    }

    const updated = await prisma.taxPayable.findMany({
      where: { userId },
      include: { payments: { where: { status: "completed" } } },
    });
    for (const tp of updated) {
      const totalPayable = decimalToNumber(tp.totalPayable);
      const totalPaid = tp.payments.reduce(
        (s, r) => s + decimalToNumber(r.amountPaid),
        0,
      );
      const status = derivePayableStatus(totalPayable, totalPaid);
      if (tp.status !== status) {
        await prisma.taxPayable.update({
          where: { id: tp.id },
          data: { status },
        });
      }
    }
  },

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
    await this.ensurePayablesForUser(userId);
    const where: {
      userId: string;
      status?: string;
      taxType?: string;
      filingDueDate?: { gte?: Date; lte?: Date };
    } = {
      userId,
    };
    if (filters?.status) where.status = filters.status;
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

    const { taxpayerContext, taxPersonaGuidance } =
      await taxComputationService.getPersonaPayloadForUser(userId);

    const data = payables.map((p) => ({
      id: p.id,
      taxType: p.taxType,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      periodLabel: `${new Date(p.periodYear, p.periodMonth - 1).toLocaleString("default", { month: "long" })} ${p.periodYear}`,
      amountDue: decimalToNumber(p.amountDue),
      penalties: decimalToNumber(p.penalties),
      totalPayable: decimalToNumber(p.totalPayable),
      filingDueDate: p.filingDueDate,
      status: p.status,
      currency: p.currency,
      totalPaid: p.payments.reduce(
        (s, r) => s + decimalToNumber(r.amountPaid),
        0,
      ),
      paymentLink: getPaymentLink(p.id, p.paymentLink),
    }));
    return {
      taxpayerContext,
      taxPersonaGuidance,
      payablesScopeNote: TAX_PAYABLES_SCOPE_NOTE,
      data,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getById(userId: string, payableId: string) {
    const p = await prisma.taxPayable.findFirst({
      where: { id: payableId, userId },
      include: { payments: { orderBy: { paidAt: "desc" } } },
    });
    if (!p) return null;
    const { taxpayerContext, taxPersonaGuidance } =
      await taxComputationService.getPersonaPayloadForUser(userId);
    const totalPaid = p.payments
      .filter((r) => r.status === "completed")
      .reduce((s, r) => s + decimalToNumber(r.amountPaid), 0);
    return {
      taxpayerContext,
      taxPersonaGuidance,
      payablesScopeNote: TAX_PAYABLES_SCOPE_NOTE,
      id: p.id,
      taxType: p.taxType,
      periodYear: p.periodYear,
      periodMonth: p.periodMonth,
      periodLabel: `${new Date(p.periodYear, p.periodMonth - 1).toLocaleString("default", { month: "long" })} ${p.periodYear}`,
      amountDue: decimalToNumber(p.amountDue),
      penalties: decimalToNumber(p.penalties),
      totalPayable: decimalToNumber(p.totalPayable),
      filingDueDate: p.filingDueDate,
      status: p.status,
      currency: p.currency,
      totalPaid,
      paymentLink: getPaymentLink(p.id, p.paymentLink),
      payments: p.payments.map((r) => ({
        id: r.id,
        amountPaid: decimalToNumber(r.amountPaid),
        method: r.method,
        status: r.status,
        externalReference: r.externalReference,
        paidAt: r.paidAt,
      })),
    };
  },
};
