import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { taxComputationService } from "./taxComputationService";
import { VAT_FILING_DAY } from "../../constants/taxPayable";
import type { TaxType, PayableStatus } from "../../constants/taxPayable";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function getFilingDueDate(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(nextYear, nextMonth - 1, VAT_FILING_DAY);
}

function derivePayableStatus(totalPayable: number, totalPaid: number): PayableStatus {
  if (totalPaid <= 0) return "pending";
  if (totalPaid >= totalPayable) return totalPaid > totalPayable ? "overpaid" : "paid";
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
      const computation = await taxComputationService.getForPeriod(userId, year, month);

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
      const totalPaid = tp.payments.reduce((s, r) => s + decimalToNumber(r.amountPaid), 0);
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
    filters?: { status?: string; taxType?: string }
  ) {
    await this.ensurePayablesForUser(userId);
    const where: { userId: string; status?: string; taxType?: string } = { userId };
    if (filters?.status) where.status = filters.status;
    if (filters?.taxType) where.taxType = filters.taxType;

    const payables = await prisma.taxPayable.findMany({
      where,
      orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
      include: {
        payments: { where: { status: "completed" }, orderBy: { paidAt: "desc" } },
      },
    });

    return payables.map((p) => ({
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
      totalPaid: p.payments.reduce((s, r) => s + decimalToNumber(r.amountPaid), 0),
    }));
  },

  async getById(userId: string, payableId: string) {
    const p = await prisma.taxPayable.findFirst({
      where: { id: payableId, userId },
      include: { payments: { orderBy: { paidAt: "desc" } } },
    });
    if (!p) return null;
    const totalPaid = p.payments
      .filter((r) => r.status === "completed")
      .reduce((s, r) => s + decimalToNumber(r.amountPaid), 0);
    return {
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
