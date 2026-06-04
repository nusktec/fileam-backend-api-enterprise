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

function periodKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function amountsFromComputation(
  computation: Awaited<ReturnType<typeof taxComputationService.getForPeriod>>,
): Array<{ taxType: TaxType; amountDue: number }> {
  return [
    { taxType: "VAT", amountDue: Math.max(0, computation.vat.netVatPayable) },
    {
      taxType: "WHT",
      amountDue: Math.max(0, computation.wht.estimatedWhtDeducted),
    },
    {
      taxType: "CIT",
      amountDue:
        computation.cit.summary > 0 ? computation.cit.summary / 12 : 0,
    },
    {
      taxType: "PIT",
      amountDue:
        computation.pit.summary > 0 ? computation.pit.summary / 12 : 0,
    },
    {
      taxType: "PAYE",
      amountDue: Math.max(0, computation.paye.summaryMonthlyEstimate),
    },
  ];
}

export const taxPayablesService = {
  /** Recompute stored payables for specific book periods (after sales/expenses change). */
  async syncPayablesForPeriods(
    userId: string,
    periods: Array<{ year: number; month: number }>,
  ) {
    const seen = new Set<string>();
    for (const p of periods) {
      const key = periodKey(p.year, p.month);
      if (seen.has(key)) continue;
      seen.add(key);
      await this.syncPeriodPayables(userId, p.year, p.month);
    }
  },

  async syncPeriodPayables(userId: string, year: number, month: number) {
    const computation = await taxComputationService.getForPeriod(
      userId,
      year,
      month,
    );
    const filingDueDate = getFilingDueDate(year, month);

    for (const { taxType, amountDue } of amountsFromComputation(computation)) {
      const existing = await prisma.taxPayable.findUnique({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId,
            taxType,
            periodYear: year,
            periodMonth: month,
          },
        },
        include: {
          payments: { where: { status: "completed" } },
        },
      });

      const totalPaid = existing
        ? existing.payments.reduce(
            (s, r) => s + decimalToNumber(r.amountPaid),
            0,
          )
        : 0;
      const hasSubmission = existing?.submittedAt != null;

      if (amountDue <= 0) {
        if (
          existing &&
          totalPaid === 0 &&
          !hasSubmission &&
          existing.status === "pending"
        ) {
          await prisma.taxPayable.delete({ where: { id: existing.id } });
        } else if (existing) {
          const totalPayable = amountDue + decimalToNumber(existing.penalties);
          const status = derivePayableStatus(totalPayable, totalPaid);
          await prisma.taxPayable.update({
            where: { id: existing.id },
            data: {
              amountDue: new Decimal(0),
              totalPayable: new Decimal(Math.max(0, totalPayable)),
              status,
            },
          });
        }
        continue;
      }

      const penalties = existing
        ? decimalToNumber(existing.penalties)
        : 0;
      const totalPayable = amountDue + penalties;
      const status = derivePayableStatus(totalPayable, totalPaid);

      await prisma.taxPayable.upsert({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId,
            taxType,
            periodYear: year,
            periodMonth: month,
          },
        },
        create: {
          userId,
          taxType,
          periodYear: year,
          periodMonth: month,
          amountDue: new Decimal(amountDue),
          penalties: new Decimal(penalties),
          totalPayable: new Decimal(totalPayable),
          filingDueDate,
          status,
        },
        update: {
          amountDue: new Decimal(amountDue),
          totalPayable: new Decimal(totalPayable),
          filingDueDate,
          status,
        },
      });
    }
  },

  async ensurePayablesForUser(userId: string, monthsBack = 12) {
    const now = new Date();
    const periods: Array<{ year: number; month: number }> = [];
    for (let i = 0; i <= monthsBack; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      periods.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }
    await this.syncPayablesForPeriods(userId, periods);
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
      periodYear?: number;
      periodMonth?: number;
    },
  ) {
    await this.ensurePayablesForUser(userId);
    const where: {
      userId: string;
      status?: string;
      taxType?: string;
      filingDueDate?: { gte?: Date; lte?: Date };
      periodYear?: number;
      periodMonth?: number;
    } = {
      userId,
    };
    if (filters?.status) where.status = filters.status;
    if (filters?.taxType) where.taxType = filters.taxType;
    if (opts?.periodYear != null && opts?.periodMonth != null) {
      where.periodYear = opts.periodYear;
      where.periodMonth = opts.periodMonth;
    } else if (opts?.dateFrom || opts?.dateTo) {
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
