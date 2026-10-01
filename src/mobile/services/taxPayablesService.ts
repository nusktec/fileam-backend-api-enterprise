import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { taxComputationService } from "./taxComputationService";
import {
  TAX_PAYABLES_SCOPE_NOTE,
  monthlyFilingDueDateUtc,
  type TaxType,
  type PayableStatus,
} from "../../constants/taxPayable";
import { citDueDateForYear } from "../../constants/citFiling";
import { pitDueDateForYear } from "../../constants/pitFiling";
import { utcCalendarDate } from "../../utils/dateRangeQuery";
import {
  monthsInTaxRange,
  type TaxPeriodRange,
} from "../../utils/taxPeriodQuery";
import { computeVatFigures, computeWhtFigures } from "./vatWhtOverviewService";
import { citFilingService } from "./citFilingService";
import { pitFilingService } from "./pitFilingService";
import { payrollService } from "./payrollService";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { collapseAnnualTaxPayables } from "./collapseAnnualTaxPayables";

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

function getMonthlyFilingDueDate(year: number, month: number): Date {
  return monthlyFilingDueDateUtc(year, month);
}

function getAnnualFilingDueDate(taxType: TaxType, year: number): Date {
  if (taxType === "CIT") {
    const [y, m, d] = citDueDateForYear(year).split("-").map(Number);
    return utcCalendarDate(y!, m!, d!);
  }
  if (taxType === "PIT") {
    const [y, m, d] = pitDueDateForYear(year).split("-").map(Number);
    return utcCalendarDate(y!, m!, d!);
  }
  return monthlyFilingDueDateUtc(year, 12);
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

function payablePeriodLabel(taxType: string, year: number, month: number): string {
  const tt = taxType.trim().toUpperCase();
  if (tt === "PIT" || tt === "CIT") return String(year);
  return `${new Date(year, month - 1).toLocaleString("default", { month: "long" })} ${year}`;
}

function payableDisplayStatus(
  taxType: string,
  status: string,
  paymentStatus: string | null,
): string {
  if (taxType.trim().toUpperCase() === "PIT" && paymentStatus) {
    return paymentStatus;
  }
  if (taxType.trim().toUpperCase() === "PIT" && status === "pending") {
    return "unpaid";
  }
  return status;
}

function periodKey(year: number, month: number): string {
  return `${year}-${month}`;
}

type PeriodComputation = Awaited<
  ReturnType<typeof taxComputationService.getForQuery>
>;

function periodKeyForFigures(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Payable amounts copied from the filing endpoints for the same tax and period.
 * VAT netVatPayable, WHT totalWht, CIT citPayable, PIT remainingPayable, PAYE amountDue.
 */
async function filingAmountsForPeriod(
  userId: string,
  year: number,
  month: number,
): Promise<Array<{ taxType: TaxType; amountDue: number }>> {
  const periodKey = periodKeyForFigures(year, month);
  const [vat, wht, citPayable, pitPayable, payeDue] = await Promise.all([
    computeVatFigures(userId, periodKey)
      .then((f) => normalizeMoneyAmount(f.netVatPayable))
      .catch(() => 0),
    computeWhtFigures(userId, periodKey)
      .then((f) => normalizeMoneyAmount(f.totalWht))
      .catch(() => 0),
    citFilingService
      .getCalculation(userId, year)
      .then((r) => normalizeMoneyAmount(r.computation.citPayable))
      .catch(() => 0),
    pitFilingService
      .getCalculation(userId, year)
      .then((r) =>
        normalizeMoneyAmount(
          (r.computation as { remainingPayable?: number }).remainingPayable ?? 0,
        ),
      )
      .catch(() => 0),
    payrollService
      .getPayee(userId, periodKey)
      .then((r) => normalizeMoneyAmount(r.summary.amountDue))
      .catch(() => 0),
  ]);

  return [
    { taxType: "VAT", amountDue: vat },
    { taxType: "WHT", amountDue: wht },
    { taxType: "PAYE", amountDue: payeDue },
    { taxType: "CIT", amountDue: citPayable },
    { taxType: "PIT", amountDue: pitPayable },
  ];
}

export function totalsFromFilingAmounts(
  rows: Array<{ taxType: TaxType; amountDue: number }>,
) {
  const pick = (t: TaxType) =>
    rows.find((r) => r.taxType === t)?.amountDue ?? 0;
  const vat = pick("VAT");
  const wht = pick("WHT");
  const paye = pick("PAYE");
  const cit = pick("CIT");
  const pit = pick("PIT");
  return { vat, wht, cit, pit, paye, total: vat + wht + cit + pit + paye };
}

async function upsertPayableRow(input: {
  userId: string;
  taxType: TaxType;
  periodYear: number;
  periodMonth: number;
  amountDue: number;
  filingDueDate: Date;
}) {
  const existing = await prisma.taxPayable.findUnique({
    where: {
      userId_taxType_periodYear_periodMonth: {
        userId: input.userId,
        taxType: input.taxType,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
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
  if (
    hasSubmission &&
    (input.taxType === "PIT" || input.taxType === "CIT")
  ) {
    return;
  }

  if (input.amountDue <= 0) {
    if (
      existing &&
      totalPaid === 0 &&
      !hasSubmission &&
      existing.status === "pending"
    ) {
      await prisma.taxPayable.delete({ where: { id: existing.id } });
    } else if (existing) {
      const penalties = decimalToNumber(existing.penalties);
      const totalPayable = input.amountDue + penalties;
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
    return;
  }

  const penalties = existing ? decimalToNumber(existing.penalties) : 0;
  const totalPayable = input.amountDue + penalties;
  const status = derivePayableStatus(totalPayable, totalPaid);

  await prisma.taxPayable.upsert({
    where: {
      userId_taxType_periodYear_periodMonth: {
        userId: input.userId,
        taxType: input.taxType,
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
      },
    },
    create: {
      userId: input.userId,
      taxType: input.taxType,
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      amountDue: new Decimal(input.amountDue),
      penalties: new Decimal(penalties),
      totalPayable: new Decimal(totalPayable),
      filingDueDate: input.filingDueDate,
      status,
    },
    update: {
      amountDue: new Decimal(input.amountDue),
      totalPayable: new Decimal(totalPayable),
      filingDueDate: input.filingDueDate,
      status,
    },
  });
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

  /** VAT / WHT / PAYE for one calendar month. */
  async syncPeriodPayables(userId: string, year: number, month: number) {
    const amounts = await filingAmountsForPeriod(userId, year, month);

    for (const { taxType, amountDue } of amounts) {
      if ((taxType === "PIT" || taxType === "CIT") && month !== 12) {
        continue;
      }
      const filingDueDate =
        taxType === "CIT"
          ? getAnnualFilingDueDate("CIT", year)
          : taxType === "PIT"
            ? getAnnualFilingDueDate("PIT", year)
            : getMonthlyFilingDueDate(year, month);
      await upsertPayableRow({
        userId,
        taxType,
        periodYear: year,
        periodMonth: month,
        amountDue,
        filingDueDate,
      });
    }
  },

  async ensurePayablesForUser(userId: string, monthsBack = 12) {
    const now = new Date();
    const anchorYear = now.getUTCFullYear();
    const anchorMonth = now.getUTCMonth() + 1;
    const periods: Array<{ year: number; month: number }> = [];
    for (let i = 0; i <= monthsBack; i++) {
      let month = anchorMonth - i;
      let year = anchorYear;
      while (month < 1) {
        month += 12;
        year -= 1;
      }
      periods.push({ year, month });
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
      range?: TaxPeriodRange;
    },
  ) {
    const range = opts?.range ?? "month";
    let periodComputation: PeriodComputation | null = null;
    let filingTotals: ReturnType<typeof totalsFromFilingAmounts> | null = null;

    if (opts?.periodYear != null && opts?.periodMonth != null) {
      const months = monthsInTaxRange(
        opts.periodYear,
        opts.periodMonth,
        range,
      );
      if (range === "month" && months.length === 1) {
        const amounts = await filingAmountsForPeriod(
          userId,
          opts.periodYear,
          opts.periodMonth,
        );
        filingTotals = totalsFromFilingAmounts(amounts);
        for (const { taxType, amountDue } of amounts) {
          if (
            (taxType === "PIT" || taxType === "CIT") &&
            opts.periodMonth !== 12
          ) {
            continue;
          }
          const filingDueDate =
            taxType === "CIT"
              ? getAnnualFilingDueDate("CIT", opts.periodYear)
              : taxType === "PIT"
                ? getAnnualFilingDueDate("PIT", opts.periodYear)
                : getMonthlyFilingDueDate(opts.periodYear, opts.periodMonth);
          await upsertPayableRow({
            userId,
            taxType,
            periodYear: opts.periodYear,
            periodMonth: opts.periodMonth,
            amountDue,
            filingDueDate,
          });
        }
      } else {
        await this.syncPayablesForPeriods(userId, months);
      }
      periodComputation = await taxComputationService.getForQuery(userId, {
        year: opts.periodYear,
        month: opts.periodMonth,
        range,
      });
    } else {
      await this.ensurePayablesForUser(userId);
    }

    await collapseAnnualTaxPayables(userId);

    const where: {
      userId: string;
      status?: string;
      taxType?: string;
      periodYear?: number;
      periodMonth?: number;
      filingDueDate?: { gte?: Date; lte?: Date };
      OR?: Array<{
        periodYear?: number;
        periodMonth?: number;
        taxType?: { in: TaxType[] };
      }>;
    } = {
      userId,
    };
    if (filters?.status) where.status = filters.status;

    if (opts?.periodYear != null && opts?.periodMonth != null) {
      const months = monthsInTaxRange(
        opts.periodYear,
        opts.periodMonth,
        range,
      );
      const taxTypeFilter = filters?.taxType?.trim().toUpperCase() as
        | TaxType
        | undefined;

      if (months.length === 1 && !taxTypeFilter) {
        where.periodYear = opts.periodYear;
        where.periodMonth = opts.periodMonth;
      } else if (months.length === 1 && taxTypeFilter) {
        where.periodYear = opts.periodYear;
        where.periodMonth = opts.periodMonth;
        where.taxType = taxTypeFilter;
      } else {
        where.OR = [
          ...months.map((m) => ({
            periodYear: m.year,
            periodMonth: m.month,
          })),
        ];
        if (taxTypeFilter) {
          where.OR = where.OR.map((clause) => ({
            ...clause,
            taxType: { in: [taxTypeFilter] },
          }));
        }
      }
    } else {
      if (filters?.taxType) where.taxType = filters.taxType;
      if (opts?.dateFrom || opts?.dateTo) {
        where.filingDueDate = {};
        if (opts.dateFrom) where.filingDueDate.gte = opts.dateFrom;
        if (opts.dateTo) where.filingDueDate.lte = opts.dateTo;
      }
    }

    const taxTypeFilterList = filters?.taxType?.trim().toUpperCase();
    if (taxTypeFilterList === "PIT" || taxTypeFilterList === "CIT") {
      where.periodMonth = 12;
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
      periodLabel: payablePeriodLabel(p.taxType, p.periodYear, p.periodMonth),
      amountDue: decimalToNumber(p.amountDue),
      penalties: decimalToNumber(p.penalties),
      totalPayable: decimalToNumber(p.totalPayable),
      filingDueDate: p.filingDueDate,
      status: payableDisplayStatus(p.taxType, p.status, p.paymentStatus),
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
      syncedBookPeriod:
        opts?.periodYear != null && opts?.periodMonth != null
          ? { year: opts.periodYear, month: opts.periodMonth }
          : null,
      period: periodComputation?.period ?? null,
      totals: filingTotals,
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
      periodLabel: payablePeriodLabel(p.taxType, p.periodYear, p.periodMonth),
      amountDue: decimalToNumber(p.amountDue),
      penalties: decimalToNumber(p.penalties),
      totalPayable: decimalToNumber(p.totalPayable),
      filingDueDate: p.filingDueDate,
      status: payableDisplayStatus(p.taxType, p.status, p.paymentStatus),
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
