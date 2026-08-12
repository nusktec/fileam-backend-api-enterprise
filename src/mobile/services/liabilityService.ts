import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { PERCENT, PERCENT_TWO_DECIMAL_ROUND } from "../../constants/percentages";
import { coerceInvoiceAmountPaid } from "../../constants/invoiceAmountPaid";
import {
  isSalePaidStatus,
  PAYMENT_TYPE_INVOICE,
  SALE_STATUS,
} from "../../constants/salePaymentRules";
import {
  OBLIGATION_STATUS,
  OBLIGATION_TYPE,
  PAYE_COLLECTING_AUTHORITY_DEFAULT,
} from "../../constants/payrollObligations";
import { TAX_TYPES } from "../../constants/taxPayable";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Upcoming payables window (active / not-overdue, due within this many days). */
const UPCOMING_WINDOW_DAYS = 30;
const API_VERSION = process.env.API_VERSION || "1";

/**
 * Canonical payable statuses (Liability API).
 * - OUTSTANDING — unpaid balance, not overdue (payment status)
 * - OVERDUE — due date passed with unpaid balance
 * - PARTIALLY_PAID — some payment made, balance remains
 * - PAID — no outstanding balance
 * - ACTIVE — open / not-overdue lifecycle label used in AP summary
 *   (`activePayables`); not used interchangeably with OUTSTANDING on item rows
 */
export const LIABILITY_STATUS = {
  OUTSTANDING: "OUTSTANDING",
  OVERDUE: "OVERDUE",
  ACTIVE: "ACTIVE",
  PARTIALLY_PAID: "PARTIALLY_PAID",
  PAID: "PAID",
} as const;

export type LiabilityStatus =
  (typeof LIABILITY_STATUS)[keyof typeof LIABILITY_STATUS];

const NON_CURRENT_LIABILITY_NAMES = [
  "Bank Loan",
  "Director Loan",
  "Shareholder Loan",
  "Mortgage",
  "Equipment Financing",
  "Lease Liability",
  "Convertible Loan",
  "Other Long-term Borrowings",
] as const;

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function round2(n: number): number {
  return (
    Math.round(n * PERCENT_TWO_DECIMAL_ROUND) / PERCENT_TWO_DECIMAL_ROUND
  );
}

function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return round2((part / whole) * PERCENT);
}

function startOfUtcDayMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatYmd(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function periodLabel(year: number, month: number): string {
  return `${new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

function overdueDays(due: Date | null | undefined, asOfMs: number): number {
  if (!due) return 0;
  const dueMs = startOfUtcDayMs(due);
  if (dueMs >= asOfMs) return 0;
  return Math.max(0, Math.floor((asOfMs - dueMs) / MS_PER_DAY));
}

function liabilityStatus(opts: {
  outstanding: number;
  total: number;
  paid: number;
  daysOverdue: number;
}): LiabilityStatus {
  if (opts.outstanding <= 0) return LIABILITY_STATUS.PAID;
  if (opts.daysOverdue > 0) return LIABILITY_STATUS.OVERDUE;
  if (opts.paid > 0 && opts.outstanding < opts.total) {
    return LIABILITY_STATUS.PARTIALLY_PAID;
  }
  return LIABILITY_STATUS.OUTSTANDING;
}

function apiPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `/api/v${API_VERSION}${p}`;
}

function isSalaryExpenseCategory(category: string | null | undefined): boolean {
  return (category ?? "").trim().toLowerCase() === "salary";
}

type ApRow = {
  name: string;
  status: LiabilityStatus;
  id: string;
  category: string;
  dueDate: string | null;
  overdueDays: number;
  invoiceReference: string;
  amount: number;
  supplierId: string | null;
  supplierName: string;
};

function emptyAgeBuckets() {
  return {
    current: 0,
    oneToThirtyDays: 0,
    thirtyOneToSixtyDays: 0,
    sixtyOneToNinetyDays: 0,
    overNinetyDays: 0,
  };
}

function addToAgeBucket(
  buckets: ReturnType<typeof emptyAgeBuckets>,
  days: number,
  amount: number,
) {
  if (days <= 0) buckets.current += amount;
  else if (days <= 30) buckets.oneToThirtyDays += amount;
  else if (days <= 60) buckets.thirtyOneToSixtyDays += amount;
  else if (days <= 90) buckets.sixtyOneToNinetyDays += amount;
  else buckets.overNinetyDays += amount;
}

/**
 * Accounts Payable ← Pay Later / supplier invoices only.
 * Salary expenses are excluded (they belong under Salaries Payable).
 */
async function buildAccountsPayable(userId: string, asOfMs: number) {
  const expenses = await prisma.expense.findMany({
    where: {
      userId,
      paymentType: PAYMENT_TYPE_INVOICE,
    },
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
  });

  const items: ApRow[] = [];
  let overduePayable = 0;

  for (const e of expenses) {
    if (e.status === SALE_STATUS.CANCELLED) continue;
    if (isSalaryExpenseCategory(e.category)) continue;

    const total = d(e.totalAmount);
    const paid = coerceInvoiceAmountPaid(e.invoiceAmountPaid).total;
    const outstanding = Math.max(0, total - paid);
    if (outstanding <= 0) continue;

    const due = e.invoiceDueDate ?? e.expenseDate;
    const days = overdueDays(due, asOfMs);
    const status = liabilityStatus({
      outstanding,
      total,
      paid,
      daysOverdue: days,
    });

    if (days > 0) overduePayable += outstanding;

    items.push({
      name: e.supplierName?.trim() || e.description,
      status,
      id: `PAYABLE-${e.expenseNumber}`,
      category: "Accounts Payable",
      dueDate: formatYmd(due),
      overdueDays: days,
      invoiceReference: e.expenseNumber,
      amount: normalizeMoneyAmount(outstanding),
      supplierId: e.supplierId,
      supplierName: e.supplierName?.trim() || e.description,
    });
  }

  const totalPayable = normalizeMoneyAmount(
    items.reduce((s, r) => s + r.amount, 0),
  );
  const overduePayables = normalizeMoneyAmount(
    items
      .filter((r) => r.status === LIABILITY_STATUS.OVERDUE)
      .reduce((s, r) => s + r.amount, 0),
  );
  const activePayables = normalizeMoneyAmount(
    items
      .filter((r) => r.status !== LIABILITY_STATUS.OVERDUE)
      .reduce((s, r) => s + r.amount, 0),
  );

  const ageBuckets = emptyAgeBuckets();
  for (const row of items) {
    addToAgeBucket(ageBuckets, row.overdueDays, row.amount);
  }
  for (const k of Object.keys(ageBuckets) as (keyof typeof ageBuckets)[]) {
    ageBuckets[k] = normalizeMoneyAmount(ageBuckets[k]);
  }

  const upcomingCutoff = asOfMs + UPCOMING_WINDOW_DAYS * MS_PER_DAY;
  const upcomingPayables = items
    .filter((r) => {
      if (r.status === LIABILITY_STATUS.OVERDUE) return false;
      if (!r.dueDate) return false;
      const dueMs = startOfUtcDayMs(new Date(r.dueDate));
      return dueMs >= asOfMs && dueMs <= upcomingCutoff;
    })
    .map(({ amount: _a, supplierId: _s, supplierName: _n, ...rest }) => rest);

  const supplierMap = new Map<
    string,
    {
      name: string;
      supplierId: string | null;
      totalOutstanding: number;
      payables: Array<Omit<ApRow, "amount" | "supplierId" | "supplierName">>;
    }
  >();

  for (const row of items) {
    const key = row.supplierId || row.supplierName;
    const existing = supplierMap.get(key) ?? {
      name: row.supplierName,
      supplierId: row.supplierId,
      totalOutstanding: 0,
      payables: [],
    };
    existing.totalOutstanding += row.amount;
    existing.payables.push({
      name: row.name,
      status: row.status,
      id: row.id,
      category: row.category,
      dueDate: row.dueDate,
      overdueDays: row.overdueDays,
      invoiceReference: row.invoiceReference,
    });
    supplierMap.set(key, existing);
  }

  const suppliers = [...supplierMap.values()].map((s) => ({
    name: s.name,
    supplierId: s.supplierId,
    totalOutstanding: normalizeMoneyAmount(s.totalOutstanding),
    payables: s.payables,
  }));

  const listItems = items.map(
    ({ amount: _a, supplierId: _s, supplierName: _n, ...rest }) => rest,
  );

  return {
    amount: totalPayable,
    overduePayable: normalizeMoneyAmount(overduePayable),
    category: {
      name: "Accounts Payable",
      amount: totalPayable,
      percentage: 0,
      payables: {
        summary: {
          activePayables,
          overduePayables,
          totalPayable,
        },
        items: listItems,
        upcomingPayables,
        reports: {
          apAgeingReport: apiPath("/mobile/liability/accounts-payable"),
          balanceSheet: apiPath("/mobile/financial-position"),
          cashFlowStatement: apiPath("/mobile/liability/cash-flow-impact"),
          taxLiabilityReport: apiPath("/mobile/tax-payables"),
          expenseIntelligence: apiPath("/mobile/expenses"),
          profitabilityAnalysis: apiPath(
            "/mobile/analytics/financial-overview",
          ),
        },
        ageingAnalysis: {
          totalOutstanding: totalPayable,
          ageBuckets,
        },
        suppliers,
      },
    },
  };
}

/** Tax Payable ← tax_payables less completed remittances. */
async function buildTaxPayable(userId: string, asOfMs: number) {
  const payables = await prisma.taxPayable.findMany({
    where: { userId },
    include: {
      payments: { where: { status: "completed" } },
    },
    orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
  });

  const itemsByType: Record<string, Array<Record<string, unknown>>> = {};
  for (const t of TAX_TYPES) itemsByType[t] = [];

  let total = 0;
  let overduePayable = 0;

  for (const p of payables) {
    const recognized = d(p.totalPayable);
    const remitted = p.payments.reduce((s, r) => s + d(r.amountPaid), 0);
    const outstanding = normalizeMoneyAmount(Math.max(0, recognized - remitted));
    if (outstanding <= 0) continue;

    const days = overdueDays(p.filingDueDate, asOfMs);
    const status = liabilityStatus({
      outstanding,
      total: recognized,
      paid: remitted,
      daysOverdue: days,
    });

    total += outstanding;
    if (days > 0) overduePayable += outstanding;

    const taxType = TAX_TYPES.includes(p.taxType as (typeof TAX_TYPES)[number])
      ? p.taxType
      : "VAT";
    const label = periodLabel(p.periodYear, p.periodMonth);
    itemsByType[taxType] = itemsByType[taxType] ?? [];
    itemsByType[taxType]!.push({
      name: `${taxType} - ${label}`,
      status,
      dueDate: formatYmd(p.filingDueDate),
      amount: outstanding,
      taxAuthority:
        p.stateOfOperation?.trim() ||
        (taxType === "PAYE" ? PAYE_COLLECTING_AUTHORITY_DEFAULT : "FIRS"),
      reference: `TAX-${taxType}-${p.periodYear}-${String(p.periodMonth).padStart(2, "0")}`,
      period: label,
    });
  }

  return {
    amount: normalizeMoneyAmount(total),
    overduePayable: normalizeMoneyAmount(overduePayable),
    category: {
      name: "Tax Payable",
      amount: normalizeMoneyAmount(total),
      percentage: 0,
      items: {
        PAYE: itemsByType.PAYE ?? [],
        VAT: itemsByType.VAT ?? [],
        WHT: itemsByType.WHT ?? [],
        CIT: itemsByType.CIT ?? [],
        PIT: itemsByType.PIT ?? [],
      },
    },
  };
}

async function buildPayrollCategory(
  userId: string,
  type: string,
  name: string,
  asOfMs: number,
) {
  const rows = await prisma.payrollObligation.findMany({
    where: { userId, type, status: OBLIGATION_STATUS.PENDING },
    orderBy: { period: "desc" },
  });

  let total = 0;
  let overduePayable = 0;
  const items = rows.map((r) => {
    const amount = normalizeMoneyAmount(d(r.amount));
    total += amount;
    const days = overdueDays(r.dueDate, asOfMs);
    if (days > 0) overduePayable += amount;
    const status = liabilityStatus({
      outstanding: amount,
      total: amount,
      paid: 0,
      daysOverdue: days,
    });
    return {
      payrollDate: formatYmd(r.dueDate) ?? `${r.period}-01`,
      status,
      amount,
    };
  });

  return {
    amount: normalizeMoneyAmount(total),
    overduePayable: normalizeMoneyAmount(overduePayable),
    category: {
      name,
      amount: normalizeMoneyAmount(total),
      percentage: 0,
      items,
    },
  };
}

/**
 * Salaries Payable ← unpaid Salary expenses (payroll settlements recorded as
 * expenses), less partial invoice payments. Not included in Accounts Payable.
 */
async function buildSalariesPayable(userId: string, asOfMs: number) {
  const expenses = await prisma.expense.findMany({
    where: {
      userId,
      category: { equals: "Salary", mode: "insensitive" },
    },
    orderBy: { expenseDate: "desc" },
  });

  let total = 0;
  let overduePayable = 0;
  const items: Array<{
    payrollDate: string | null;
    status: LiabilityStatus;
    amount: number;
  }> = [];

  for (const e of expenses) {
    if (isSalePaidStatus(e.status) || e.status === SALE_STATUS.CANCELLED) {
      continue;
    }
    const totalAmt = d(e.totalAmount);
    let outstanding = totalAmt;
    let paid = 0;
    if (e.paymentType === PAYMENT_TYPE_INVOICE) {
      paid = coerceInvoiceAmountPaid(e.invoiceAmountPaid).total;
      outstanding = Math.max(0, totalAmt - paid);
    }
    if (outstanding <= 0) continue;

    const due = e.invoiceDueDate ?? e.expenseDate;
    const days = overdueDays(due, asOfMs);
    if (days > 0) overduePayable += outstanding;
    total += outstanding;
    items.push({
      payrollDate: formatYmd(due),
      status: liabilityStatus({
        outstanding,
        total: totalAmt,
        paid,
        daysOverdue: days,
      }),
      amount: normalizeMoneyAmount(outstanding),
    });
  }

  return {
    amount: normalizeMoneyAmount(total),
    overduePayable: normalizeMoneyAmount(overduePayable),
    category: {
      name: "Salaries Payable",
      amount: normalizeMoneyAmount(total),
      percentage: 0,
      items,
    },
  };
}

function emptyNamedCategory(name: string) {
  return {
    amount: 0,
    overduePayable: 0,
    category: {
      name,
      amount: 0,
      percentage: 0,
      items: [] as unknown[],
    },
  };
}

/**
 * Cash leaving the business for liability settlement this calendar month.
 * Components are disjoint: AP invoice settlements, tax remittances, payroll
 * remittances, salary expense settlements — no double-counting.
 */
async function buildCashFlowImpact(userId: string) {
  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  const [apSettlements, salarySettlements, taxPayments, payrollPaid] =
    await Promise.all([
      prisma.expense.findMany({
        where: {
          userId,
          paymentType: PAYMENT_TYPE_INVOICE,
          updatedAt: { gte: periodStart, lt: periodEnd },
          NOT: { category: { equals: "Salary", mode: "insensitive" } },
        },
        select: {
          invoiceAmountPaid: true,
          status: true,
        },
      }),
      prisma.expense.findMany({
        where: {
          userId,
          category: { equals: "Salary", mode: "insensitive" },
          status: { in: [SALE_STATUS.PAID, "Paid"] },
          updatedAt: { gte: periodStart, lt: periodEnd },
        },
        select: {
          totalAmount: true,
          invoiceAmountPaid: true,
          paymentType: true,
        },
      }),
      prisma.paymentRecord.findMany({
        where: {
          userId,
          status: "completed",
          OR: [
            { paidAt: { gte: periodStart, lt: periodEnd } },
            {
              paidAt: null,
              createdAt: { gte: periodStart, lt: periodEnd },
            },
          ],
        },
        select: { amountPaid: true },
      }),
      prisma.payrollObligation.findMany({
        where: {
          userId,
          status: OBLIGATION_STATUS.PAID,
          paidAt: { gte: periodStart, lt: periodEnd },
        },
        select: { amount: true },
      }),
    ]);

  let apOut = 0;
  for (const e of apSettlements) {
    const paid = coerceInvoiceAmountPaid(e.invoiceAmountPaid).total;
    if (paid > 0) apOut += paid;
    else if (isSalePaidStatus(e.status)) {
      // fully settled invoice without itemized paid blob — skip; paid via coerce
    }
  }

  let salaryOut = 0;
  for (const e of salarySettlements) {
    if (e.paymentType === PAYMENT_TYPE_INVOICE) {
      salaryOut += coerceInvoiceAmountPaid(e.invoiceAmountPaid).total;
    } else {
      salaryOut += d(e.totalAmount);
    }
  }

  const taxOut = taxPayments.reduce((s, p) => s + d(p.amountPaid), 0);
  const payrollOut = payrollPaid.reduce((s, p) => s + d(p.amount), 0);

  const netCashOutflow = normalizeMoneyAmount(
    apOut + salaryOut + taxOut + payrollOut,
  );

  return {
    netCashOutflow,
    overdueSettlement: 0,
    scheduledDebtRepayment: 0,
    interestExpense: 0,
    interestDue: 0,
  };
}

export type LiabilityTotals = {
  totalLiability: number;
  currentLiability: number;
  nonCurrentLiability: number;
  overduePayable: number;
  accountsPayable: number;
  taxPayable: number;
  salariesPayable: number;
  pensionPayable: number;
  nhfPayable: number;
};

type LiabilityBundle = {
  summary: {
    totalLiability: number;
    currentLiability: number;
    nonCurrentLiability: number;
    overduePayable: number;
  };
  currentLiabilities: Array<Record<string, unknown> & { name: string; amount: number; percentage: number }>;
  nonCurrentLiabilities: Array<{ name: string; amount: number; percentage: number }>;
  accountsPayable: Record<string, unknown>;
  cashFlowImpact: {
    netCashOutflow: number;
    overdueSettlement: number;
    scheduledDebtRepayment: number;
    interestExpense: number;
    interestDue: number;
  };
};

async function loadLiabilityBundle(userId: string): Promise<LiabilityBundle> {
  const asOfMs = startOfUtcDayMs(new Date());

  const [ap, tax, salaries, pension, nhf, cashFlowImpact] = await Promise.all([
    buildAccountsPayable(userId, asOfMs),
    buildTaxPayable(userId, asOfMs),
    buildSalariesPayable(userId, asOfMs),
    buildPayrollCategory(
      userId,
      OBLIGATION_TYPE.PENSION,
      "Pension Payable",
      asOfMs,
    ),
    buildPayrollCategory(userId, OBLIGATION_TYPE.NHF, "NHF Payable", asOfMs),
    buildCashFlowImpact(userId),
  ]);

  const interest = emptyNamedCategory("Interest Payable");
  const shortTermLoan = emptyNamedCategory("Short-Term Loan");

  const currentRaw = [
    ap.category,
    tax.category,
    salaries.category,
    pension.category,
    nhf.category,
    interest.category,
    shortTermLoan.category,
  ];

  const currentLiability = normalizeMoneyAmount(
    currentRaw.reduce((s, c) => s + c.amount, 0),
  );

  const currentLiabilities = currentRaw.map((c) => ({
    ...c,
    percentage: percentOf(c.amount, currentLiability),
  }));

  const nonCurrentLiabilities = NON_CURRENT_LIABILITY_NAMES.map((name) => ({
    name,
    amount: 0,
    percentage: 0,
  }));
  const nonCurrentLiability = 0;

  const overduePayable = normalizeMoneyAmount(
    ap.overduePayable +
      tax.overduePayable +
      salaries.overduePayable +
      pension.overduePayable +
      nhf.overduePayable,
  );

  return {
    summary: {
      totalLiability: normalizeMoneyAmount(
        currentLiability + nonCurrentLiability,
      ),
      currentLiability,
      nonCurrentLiability,
      overduePayable,
    },
    currentLiabilities,
    nonCurrentLiabilities,
    accountsPayable: {
      ...ap.category,
      percentage: percentOf(ap.category.amount, currentLiability),
    },
    cashFlowImpact,
  };
}

function categoryOverview(
  categories: Array<{ name: string; amount: number; percentage: number }>,
) {
  return categories.map(({ name, amount, percentage }) => ({
    name,
    amount,
    percentage,
  }));
}

export const liabilityService = {
  async getTotals(userId: string): Promise<LiabilityTotals> {
    const bundle = await loadLiabilityBundle(userId);
    return {
      totalLiability: bundle.summary.totalLiability,
      currentLiability: bundle.summary.currentLiability,
      nonCurrentLiability: bundle.summary.nonCurrentLiability,
      overduePayable: bundle.summary.overduePayable,
      accountsPayable:
        bundle.currentLiabilities.find((c) => c.name === "Accounts Payable")
          ?.amount ?? 0,
      taxPayable:
        bundle.currentLiabilities.find((c) => c.name === "Tax Payable")
          ?.amount ?? 0,
      salariesPayable:
        bundle.currentLiabilities.find((c) => c.name === "Salaries Payable")
          ?.amount ?? 0,
      pensionPayable:
        bundle.currentLiabilities.find((c) => c.name === "Pension Payable")
          ?.amount ?? 0,
      nhfPayable:
        bundle.currentLiabilities.find((c) => c.name === "NHF Payable")
          ?.amount ?? 0,
    };
  },

  /** 1 — High-level totals only. */
  async getSummary(userId: string) {
    const { summary } = await loadLiabilityBundle(userId);
    return {
      totalLiability: summary.totalLiability,
      currentLiability: summary.currentLiability,
      nonCurrentLiability: summary.nonCurrentLiability,
    };
  },

  /**
   * 2 — Dashboard overview: summary + overdue + lightweight category lists
   * (name/amount/percentage) + cash-flow totals. Deep AP nesting lives on
   * /accounts-payable; full category trees on /current-liabilities.
   */
  async getDashboard(userId: string) {
    const bundle = await loadLiabilityBundle(userId);
    return {
      summary: bundle.summary,
      currentLiabilities: categoryOverview(bundle.currentLiabilities),
      nonCurrentLiabilities: categoryOverview(bundle.nonCurrentLiabilities),
      cashFlowImpact: bundle.cashFlowImpact,
    };
  },

  /** 3 — Full current-liability category trees (incl. nested items / AP payables). */
  async getCurrentLiabilities(userId: string) {
    const bundle = await loadLiabilityBundle(userId);
    return {
      total: bundle.summary.currentLiability,
      overduePayable: bundle.summary.overduePayable,
      items: bundle.currentLiabilities,
    };
  },

  /** 4 — Non-current liability categories. */
  async getNonCurrentLiabilities(userId: string) {
    const bundle = await loadLiabilityBundle(userId);
    return {
      total: bundle.summary.nonCurrentLiability,
      items: bundle.nonCurrentLiabilities,
    };
  },

  /** 5 — Accounts Payable detail (ageing, suppliers, upcoming, reports). */
  async getAccountsPayable(userId: string) {
    const bundle = await loadLiabilityBundle(userId);
    return bundle.accountsPayable;
  },

  /** 6 — Cash flow impact of liability settlements. */
  async getCashFlowImpact(userId: string) {
    return buildCashFlowImpact(userId);
  },
};
