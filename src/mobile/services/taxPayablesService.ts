import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { taxComputationService } from "./taxComputationService";
import {
  TAX_PAYABLES_SCOPE_NOTE,
  monthlyFilingDueDateUtc,
  type TaxType,
  type PayableStatus,
} from "../../constants/taxPayable";
import { citDueDateForYear, CIT_PERIOD_MONTH } from "../../constants/citFiling";
import { pitDueDateForYear, PIT_PERIOD_MONTH } from "../../constants/pitFiling";
import { utcCalendarDate } from "../../utils/dateRangeQuery";
import {
  bookPeriodsOverlappingRange,
  calendarYearsFromBookPeriods,
} from "../../utils/bookPeriodQuery";
import {
  monthsInTaxRange,
  type TaxPeriodRange,
} from "../../utils/taxPeriodQuery";
import { buildTaxEligibilityProfileForUser } from "./taxEligibilityService";
import { ASSET_ON_BOOKS_STATUSES } from "../../constants/assets";

const PAYMENT_BASE_URL =
  process.env.PAYMENT_BASE_URL || "https://pay.fileam.app";

const MONTHLY_SYNC_TAX_TYPES: TaxType[] = ["VAT", "WHT", "PAYE"];
const ANNUAL_SYNC_TAX_TYPES: TaxType[] = ["CIT", "PIT"];

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

/** VAT / WHT / PAYE — per book month. */
function monthlyAmountsFromComputation(
  computation: PeriodComputation,
): Array<{ taxType: TaxType; amountDue: number }> {
  const flags = computation.taxPersonaGuidance.applicableTaxes;
  return [
    {
      taxType: "VAT",
      amountDue: flags.vat
        ? Math.max(0, computation.vat.periodAmount)
        : 0,
    },
    {
      taxType: "WHT",
      amountDue: flags.wht
        ? Math.max(0, computation.wht.periodAmount)
        : 0,
    },
    {
      taxType: "PAYE",
      amountDue:
        flags.paye && computation.paye.applicable
          ? Math.max(0, computation.paye.periodAmount)
          : 0,
    },
  ];
}

function annualAmountsFromComputation(
  computation: PeriodComputation,
): Array<{ taxType: TaxType; amountDue: number }> {
  const flags = computation.taxPersonaGuidance.applicableTaxes;
  return [
    {
      taxType: "CIT",
      amountDue: flags.cit
        ? Math.max(0, computation.cit.totalCitLiability)
        : 0,
    },
    {
      taxType: "PIT",
      amountDue: flags.pit
        ? Math.max(0, computation.pit.estimatedAnnualPit)
        : 0,
    },
  ];
}

export function totalsFromComputation(
  computation: PeriodComputation,
  opts?: { includeAnnualCitPit?: boolean },
) {
  const flags = computation.taxPersonaGuidance.applicableTaxes;
  const vat = flags.vat ? Math.max(0, computation.vat.periodAmount) : 0;
  const wht = flags.wht ? Math.max(0, computation.wht.periodAmount) : 0;
  const paye =
    flags.paye && computation.paye.applicable
      ? Math.max(0, computation.paye.periodAmount)
      : 0;
  const cit = flags.cit
    ? opts?.includeAnnualCitPit
      ? Math.max(0, computation.cit.totalCitLiability)
      : 0
    : 0;
  const pit = flags.pit
    ? opts?.includeAnnualCitPit
      ? Math.max(0, computation.pit.estimatedAnnualPit)
      : 0
    : 0;
  const total = vat + wht + cit + pit + paye;
  return { vat, wht, cit, pit, paye, total };
}

function annualEstimatesFromComputation(computation: PeriodComputation) {
  const flags = computation.taxPersonaGuidance.applicableTaxes;
  return {
    cit: flags.cit
      ? Math.max(0, computation.cit.totalCitLiability)
      : 0,
    pit: flags.pit
      ? Math.max(0, computation.pit.estimatedAnnualPit)
      : 0,
  };
}

/** Annual CIT/PIT rows list only when the book-period filter includes December. */
function bookPeriodIncludesDecember(
  periods: Array<{ year: number; month: number }>,
): boolean {
  return periods.some((p) => p.month === PIT_PERIOD_MONTH);
}

function shouldListAnnualPayables(
  periods: Array<{ year: number; month: number }>,
  taxTypeFilter?: TaxType,
): boolean {
  if (taxTypeFilter === "CIT" || taxTypeFilter === "PIT") return true;
  return bookPeriodIncludesDecember(periods);
}

function buildPayablesWhereForBookPeriods(input: {
  periodYear: number;
  periodMonth: number;
  taxType?: TaxType;
  includeAnnual?: boolean;
}): Array<Record<string, unknown>> {
  const tt = input.taxType?.trim().toUpperCase() as TaxType | undefined;
  const includeAnnual = input.includeAnnual ?? false;
  if (tt === "CIT" || tt === "PIT") {
    return [
      {
        periodYear: input.periodYear,
        periodMonth:
          tt === "CIT" ? CIT_PERIOD_MONTH : PIT_PERIOD_MONTH,
        taxType: tt,
      },
    ];
  }
  if (tt === "VAT" || tt === "WHT" || tt === "PAYE") {
    return [
      {
        periodYear: input.periodYear,
        periodMonth: input.periodMonth,
        taxType: tt,
      },
    ];
  }
  const clauses: Array<Record<string, unknown>> = [
    {
      periodYear: input.periodYear,
      periodMonth: input.periodMonth,
      taxType: { in: [...MONTHLY_SYNC_TAX_TYPES] },
    },
  ];
  if (includeAnnual) {
    clauses.push(
      {
        periodYear: input.periodYear,
        periodMonth: CIT_PERIOD_MONTH,
        taxType: "CIT",
      },
      {
        periodYear: input.periodYear,
        periodMonth: PIT_PERIOD_MONTH,
        taxType: "PIT",
      },
    );
  }
  return clauses;
}

function buildPayablesWhereForBookPeriodList(
  periods: Array<{ year: number; month: number }>,
  taxType?: TaxType,
  includeAnnual = false,
): Array<Record<string, unknown>> {
  const tt = taxType?.trim().toUpperCase() as TaxType | undefined;
  const years = calendarYearsFromBookPeriods(periods);

  if (tt === "CIT") {
    return years.map((year) => ({
      periodYear: year,
      periodMonth: CIT_PERIOD_MONTH,
      taxType: "CIT",
    }));
  }
  if (tt === "PIT") {
    return years.map((year) => ({
      periodYear: year,
      periodMonth: PIT_PERIOD_MONTH,
      taxType: "PIT",
    }));
  }
  if (tt === "VAT" || tt === "WHT" || tt === "PAYE") {
    return periods.map((p) => ({
      periodYear: p.year,
      periodMonth: p.month,
      taxType: tt,
    }));
  }

  const clauses: Array<Record<string, unknown>> = periods.map((p) => ({
    periodYear: p.year,
    periodMonth: p.month,
    taxType: { in: [...MONTHLY_SYNC_TAX_TYPES] },
  }));

  if (includeAnnual) {
    for (const year of years) {
      if (periods.some((p) => p.year === year && p.month === PIT_PERIOD_MONTH)) {
        clauses.push(
          {
            periodYear: year,
            periodMonth: CIT_PERIOD_MONTH,
            taxType: "CIT",
          },
          {
            periodYear: year,
            periodMonth: PIT_PERIOD_MONTH,
            taxType: "PIT",
          },
        );
      }
    }
  }

  return clauses;
}

async function removeOrphanMonthlyCitPitRows(userId: string, year: number) {
  await prisma.taxPayable.deleteMany({
    where: {
      userId,
      taxType: { in: [...ANNUAL_SYNC_TAX_TYPES] },
      periodYear: year,
      periodMonth: { notIn: [CIT_PERIOD_MONTH, PIT_PERIOD_MONTH] },
      submittedAt: null,
    },
  });
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

  /** Annual CIT/PIT at periodMonth 12 — same figures as filing calculation. */
  async syncAnnualPayablesForYear(userId: string, year: number) {
    const [business, fixedAssetRows, taxProfile] = await Promise.all([
      prisma.business.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
        select: { businessType: true, sector: true },
      }),
      prisma.asset.findMany({
        where: { userId, status: { in: [...ASSET_ON_BOOKS_STATUSES] } },
        select: { purchaseCost: true },
      }),
      buildTaxEligibilityProfileForUser(userId),
    ]);

    const anchorMonth =
      year === new Date().getUTCFullYear()
        ? new Date().getUTCMonth() + 1
        : PIT_PERIOD_MONTH;
    const [computation, annualEstimates] = await Promise.all([
      taxComputationService.getForPeriod(userId, year, anchorMonth),
      taxComputationService.getAnnualTaxEstimates(userId, year, {
        business,
        taxProfile,
        fixedAssetRows,
      }),
    ]);

    for (const { taxType, amountDue } of annualAmountsFromComputation(
      computation,
    )) {
      const periodMonth =
        taxType === "CIT" ? CIT_PERIOD_MONTH : PIT_PERIOD_MONTH;
      await upsertPayableRow({
        userId,
        taxType,
        periodYear: year,
        periodMonth,
        amountDue,
        filingDueDate: getAnnualFilingDueDate(taxType, year),
      });
    }

    await removeOrphanMonthlyCitPitRows(userId, year);

    return {
      cit: annualEstimates.citEstimate.totalCitLiability,
      pit: annualEstimates.pitEstimate.remainingPayable,
    };
  },

  /** VAT / WHT / PAYE for one calendar month; refreshes annual CIT/PIT for the year. */
  async syncPeriodPayables(userId: string, year: number, month: number) {
    const computation = await taxComputationService.getForPeriod(
      userId,
      year,
      month,
    );

    for (const { taxType, amountDue } of monthlyAmountsFromComputation(
      computation,
    )) {
      await upsertPayableRow({
        userId,
        taxType,
        periodYear: year,
        periodMonth: month,
        amountDue,
        filingDueDate: getMonthlyFilingDueDate(year, month),
      });
    }

    await this.syncAnnualPayablesForYear(userId, year);
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
    for (const y of calendarYearsFromBookPeriods(periods)) {
      await this.syncAnnualPayablesForYear(userId, y);
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
      periodYear?: number;
      periodMonth?: number;
      range?: TaxPeriodRange;
    },
  ) {
    const range = opts?.range ?? "month";
    let periodComputation: PeriodComputation | null = null;

    if (opts?.periodYear != null && opts?.periodMonth != null) {
      const months = monthsInTaxRange(
        opts.periodYear,
        opts.periodMonth,
        range,
      );
      if (range === "month" && months.length === 1) {
        await this.syncPeriodPayables(
          userId,
          opts.periodYear,
          opts.periodMonth,
        );
      } else {
        await this.syncPayablesForPeriods(userId, months);
        const years = calendarYearsFromBookPeriods(months);
        for (const y of years) {
          await this.syncAnnualPayablesForYear(userId, y);
        }
      }
      periodComputation = await taxComputationService.getForQuery(userId, {
        year: opts.periodYear,
        month: opts.periodMonth,
        range,
      });
    } else if (opts?.dateFrom || opts?.dateTo) {
      const bookPeriods = bookPeriodsOverlappingRange(
        opts.dateFrom,
        opts.dateTo,
      );
      await this.syncPayablesForPeriods(userId, bookPeriods);
      for (const y of calendarYearsFromBookPeriods(bookPeriods)) {
        await this.syncAnnualPayablesForYear(userId, y);
      }
      if (bookPeriods.length > 0) {
        const anchor = bookPeriods[bookPeriods.length - 1]!;
        periodComputation = await taxComputationService.getForQuery(userId, {
          year: anchor.year,
          month: anchor.month,
          range: "month",
        });
      }
    } else {
      await this.ensurePayablesForUser(userId);
    }

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

    const taxTypeFilter = filters?.taxType?.trim().toUpperCase() as
      | TaxType
      | undefined;

    let filteredBookPeriods: Array<{ year: number; month: number }> = [];
    let includeAnnualInList = false;

    if (opts?.periodYear != null && opts?.periodMonth != null) {
      filteredBookPeriods = monthsInTaxRange(
        opts.periodYear,
        opts.periodMonth,
        range,
      );
      includeAnnualInList = shouldListAnnualPayables(
        filteredBookPeriods,
        taxTypeFilter,
      );

      if (filteredBookPeriods.length === 1) {
        where.OR = buildPayablesWhereForBookPeriods({
          periodYear: opts.periodYear,
          periodMonth: opts.periodMonth,
          taxType: taxTypeFilter,
          includeAnnual: includeAnnualInList,
        });
      } else {
        where.OR = buildPayablesWhereForBookPeriodList(
          filteredBookPeriods,
          taxTypeFilter,
          includeAnnualInList,
        );
      }
    } else if (opts?.dateFrom || opts?.dateTo) {
      filteredBookPeriods = bookPeriodsOverlappingRange(
        opts.dateFrom,
        opts.dateTo,
      );
      includeAnnualInList = shouldListAnnualPayables(
        filteredBookPeriods,
        taxTypeFilter,
      );
      if (filteredBookPeriods.length > 0) {
        where.OR = buildPayablesWhereForBookPeriodList(
          filteredBookPeriods,
          taxTypeFilter,
          includeAnnualInList,
        );
      } else {
        where.periodYear = -1;
      }
    } else {
      if (filters?.taxType) where.taxType = filters.taxType;
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
    const annualEstimates = periodComputation
      ? annualEstimatesFromComputation(periodComputation)
      : null;

    return {
      taxpayerContext,
      taxPersonaGuidance,
      payablesScopeNote: TAX_PAYABLES_SCOPE_NOTE,
      syncedBookPeriod:
        opts?.periodYear != null && opts?.periodMonth != null
          ? { year: opts.periodYear, month: opts.periodMonth }
          : null,
      period: periodComputation?.period ?? null,
      annualPayablesIncludedInList: includeAnnualInList,
      annualEstimates:
        !includeAnnualInList &&
        annualEstimates &&
        (annualEstimates.cit > 0 || annualEstimates.pit > 0)
          ? annualEstimates
          : null,
      totals: periodComputation
        ? totalsFromComputation(periodComputation, {
            includeAnnualCitPit: includeAnnualInList,
          })
        : null,
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
