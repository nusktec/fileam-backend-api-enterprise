import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  WHT_RATE_SERVICES_PERCENT,
  VAT_TURNOVER_THRESHOLD_NGN,
} from "../../constants/percentages";
import { WHT_RATE_TABLE } from "../../constants/beneficiary";
import { estimateCitFromBooks, roundCitNaira } from "../../constants/citFiling";
import {
  chartNetByCode,
  chartSum,
  ledgerCashFlow,
  ledgerNetByRawCode,
} from "./ledgerBalanceSheet";
import { storedClientCitRate } from "./clientCitRate";
import { ASSET_ON_BOOKS_STATUSES } from "../../constants/assets";
import { estimateAnnualPersonalIncomeTaxNg } from "../../constants/pitComputation";
import {
  computeLegacyPayeMonthlyFromProfileGross,
} from "../../constants/payroll";
import { computeTotalMonthlyPayeForUser } from "../../mobile/services/employeesService";
import { buildTaxPersonaGuidancePayload } from "../../constants/taxPersona";
import { VAT_FILING_DAY } from "../../constants/taxPayable";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import {
  resolvePlDateRange,
  type ProfitAndLossQueryOpts,
} from "./enterpriseFinancialsService";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function formatNgnShort(n: number): string {
  const v = Math.abs(n);
  if (v >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(1)}B`;
  if (v >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${normalizeMoneyAmount(n).toLocaleString("en-NG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function vatFilingDueIso(periodYear: number, periodMonth1Based: number): string {
  const m0 = periodMonth1Based - 1;
  const due = new Date(periodYear, m0 + 1, VAT_FILING_DAY);
  return due.toISOString().slice(0, 10);
}

function dueDateStatus(isoDate: string): "overdue" | "upcoming" | "future" {
  const due = new Date(`${isoDate}T23:59:59.000Z`);
  const now = new Date();
  const diffDays = Math.ceil(
    (due.getTime() - now.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays < 0) return "overdue";
  if (diffDays <= 30) return "upcoming";
  return "future";
}

type SectionStatus =
  | "current_year"
  | "partially_applied"
  | "computed"
  | "filed"
  | "overdue";

function payableSectionStatus(
  rows: { status: string; filingDueDate: Date; submittedAt: Date | null }[],
): SectionStatus {
  if (rows.length === 0) return "current_year";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const pendingPast = rows.some((r) => {
    if (r.status === "paid" || r.status === "overpaid") return false;
    const d = new Date(r.filingDueDate);
    d.setHours(0, 0, 0, 0);
    return d < now;
  });
  if (pendingPast) return "overdue";
  const submitted = rows.filter((r) => r.submittedAt != null).length;
  if (submitted === 0) return "current_year";
  if (submitted >= rows.length && rows.length > 0) return "filed";
  return "partially_applied";
}

export function resolveInsightsDateRange(query: {
  dateFrom?: string;
  dateTo?: string;
  preset?: string;
  year?: number;
  month?: number;
}): { start: Date; end: Date } {
  const opts: ProfitAndLossQueryOpts = {
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    preset: query.preset,
    year: query.year,
    month: query.month,
    linkedClientContext: true,
  };
  const { start, end } = resolvePlDateRange(opts);
  return { start, end };
}

export async function getClientCashFlow(
  linkedUserId: string,
  query: { dateFrom?: string; dateTo?: string; preset?: string },
) {
  const { start, end } = resolveInsightsDateRange(query);
  const dayBeforeStart = new Date(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate() - 1),
  );
  const endDay = new Date(
    Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()),
  );
  const [openingRaw, closingRaw] = await Promise.all([
    ledgerNetByRawCode(linkedUserId, { to: dayBeforeStart }),
    ledgerNetByRawCode(linkedUserId, { to: endDay }),
  ]);
  const cashAt = (raw: Map<string, number>) => {
    const { chart } = chartNetByCode(raw);
    return normalizeMoneyAmount(chartSum(chart, ["1110", "1120"]));
  };
  const openingCash = cashAt(openingRaw);
  const closingCash = cashAt(closingRaw);

  const flowStart = new Date(
    Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
  );
  const movements = await ledgerCashFlow(linkedUserId, flowStart, endDay);
  const operatingItems = [...movements.operating];
  const investingItems = movements.investing;
  const financingItems = movements.financing;
  const classified = normalizeMoneyAmount(
    [...operatingItems, ...investingItems, ...financingItems].reduce(
      (sum, item) => sum + item.amount,
      0,
    ),
  );
  const cashChange = normalizeMoneyAmount(closingCash - openingCash);
  const unclassified = normalizeMoneyAmount(cashChange - classified);
  if (unclassified !== 0) {
    operatingItems.push({
      label: "Other cash movements",
      description:
        "Change in cash and bank that is not tied to a classified journal line",
      amount: unclassified,
    });
  }

  const operatingTotal = operatingItems.reduce((sum, item) => sum + item.amount, 0);
  const investingTotal = investingItems.reduce((sum, item) => sum + item.amount, 0);
  const financingTotal = financingItems.reduce((sum, item) => sum + item.amount, 0);
  const netCashPosition = normalizeMoneyAmount(
    operatingTotal + investingTotal + financingTotal,
  );

  const insight =
    unclassified === 0
      ? `Cash and bank moved by ${formatNgnShort(netCashPosition)} in the period, from ${formatNgnShort(openingCash)} to ${formatNgnShort(closingCash)}.`
      : `Classified journals explain ${formatNgnShort(classified)} of the ${formatNgnShort(cashChange)} change in cash and bank. The remainder is reported as other cash movements.`;

  const netProfit = operatingTotal;
  const periodLabel = start.toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return {
    insight,
    operating: {
      total: operatingTotal,
      items: operatingItems,
      netProfit,
      adjustments: operatingItems.map((item) => ({
        name: item.label,
        amount: item.amount,
      })),
      netCashFromOperating: operatingTotal,
    },
    investing: {
      total: investingTotal,
      items: investingItems,
      netCashFromInvesting: investingTotal,
    },
    financing: {
      total: financingTotal,
      items: financingItems,
      netCashFromFinancing: financingTotal,
    },
    netCashPosition,
    period: periodLabel,
    netChangeInCash: normalizeMoneyAmount(closingCash - openingCash),
    openingCash,
    closingCash,
    cashSource: "ledger" as const,
    taxgptInsights: [{ type: "insight" as const, text: insight }],
  };
}

export async function getClientTaxLiability(linkedUserId: string, year: number) {
  const y = Number.isFinite(year) ? year : new Date().getFullYear();
  const start = new Date(y, 0, 1, 0, 0, 0, 0);
  const end = new Date(y, 11, 31, 23, 59, 59, 999);

  const [sales, expenses, user, payables, business, fixedAssetRows] =
    await Promise.all([
    prisma.sale.findMany({
      where: { userId: linkedUserId, saleDate: { gte: start, lte: end } },
    }),
    prisma.expense.findMany({
      where: { userId: linkedUserId, expenseDate: { gte: start, lte: end } },
    }),
    prisma.user.findUnique({
      where: { id: linkedUserId },
      select: {
        taxPersona: true,
        solopreneurRegistration: true,
        employmentGrossSalaryMonthly: true,
      },
    }),
    prisma.taxPayable.findMany({
      where: { userId: linkedUserId, periodYear: y },
    }),
    prisma.business.findFirst({
      where: { userId: linkedUserId },
      orderBy: { updatedAt: "desc" },
      select: { businessType: true, sector: true },
    }),
    prisma.asset.findMany({
      where: {
        userId: linkedUserId,
        status: { in: [...ASSET_ON_BOOKS_STATUSES] },
      },
      select: { purchaseCost: true },
    }),
  ]);

  const guidance = buildTaxPersonaGuidancePayload(
    user?.taxPersona ?? null,
    user?.solopreneurRegistration ?? null,
  );
  const flags = guidance.applicableTaxes;

  const { taxComputationService } = await import(
    "../../mobile/services/taxComputationService"
  );
  let outputVat = 0;
  let inputVat = 0;
  let netVat = 0;
  let totalIncomeExVat = 0;
  for (let month = 1; month <= 12; month++) {
    const comp = await taxComputationService.getForPeriod(linkedUserId, y, month);
    outputVat += comp.vat.outputVat;
    inputVat += comp.vat.inputVatClaimable;
    netVat += comp.vat.netVatPayable;
    totalIncomeExVat += comp.overview.totalIncome;
  }
  outputVat = normalizeMoneyAmount(outputVat);
  inputVat = normalizeMoneyAmount(inputVat);
  netVat = normalizeMoneyAmount(netVat);
  totalIncomeExVat = normalizeMoneyAmount(totalIncomeExVat);

  const totalIncome = sales.reduce(
    (s, x) => s + decimalToNumber(x.totalAmount),
    0,
  );
  const serviceIncome = sales
    .filter((x) => x.serviceIncome)
    .reduce((s, x) => s + decimalToNumber(x.amount), 0);
  const totalExpenses = expenses.reduce(
    (s, x) => s + decimalToNumber(x.totalAmount),
    0,
  );
  const netProfit = totalIncome - totalExpenses;
  const taxableProfit = Math.max(0, Math.round(netProfit));
  const fixedAssetsProxy = fixedAssetRows.reduce(
    (s, x) => s + decimalToNumber(x.purchaseCost),
    0,
  );
  const booksCit = estimateCitFromBooks({
    annualizedTurnover: totalIncome,
    annualizedProfit: taxableProfit,
    fixedAssets: fixedAssetsProxy,
    businessType: business?.businessType,
    sector: business?.sector,
  });
  const storedCitRate = await storedClientCitRate({
    clientUserId: linkedUserId,
  });
  const citRate = storedCitRate ?? booksCit.citRate;
  const estimatedAnnualCit =
    storedCitRate == null
      ? booksCit.estimatedAnnualCit
      : roundCitNaira(booksCit.assessableProfitProxy * (storedCitRate / PERCENT));
  const citEstimate = {
    ...booksCit,
    citRate,
    estimatedAnnualCit,
    totalCitLiability: estimatedAnnualCit + booksCit.developmentLevy,
  };
  const citLiability = citEstimate.totalCitLiability;
  const whtRentRate = WHT_RATE_TABLE.RENT.corporate;

  const whtServices = Math.round(
    (serviceIncome * WHT_RATE_SERVICES_PERCENT) / PERCENT,
  );
  let whtRent = 0;
  let whtSurvey = 0;
  for (const e of expenses) {
    const base = decimalToNumber(e.amount);
    const c = norm(e.category);
    const h = `${c} ${norm(e.description)}`;
    if (/(rent|lease)/i.test(h))
      whtRent += Math.round((base * whtRentRate) / PERCENT);
    else if (/survey/i.test(h))
      whtSurvey += Math.round((base * 5) / PERCENT);
  }
  const whtTotal = whtServices + whtRent + whtSurvey;

  const salaryMonthly =
    user?.employmentGrossSalaryMonthly != null
      ? decimalToNumber(user.employmentGrossSalaryMonthly)
      : 0;
  let payeAnnual = 0;
  if (flags.paye) {
    const employeePayeMonthly = await computeTotalMonthlyPayeForUser(linkedUserId);
    if (employeePayeMonthly > 0) {
      payeAnnual = Math.round(employeePayeMonthly * 12);
    } else if (salaryMonthly > 0) {
      payeAnnual = Math.round(
        computeLegacyPayeMonthlyFromProfileGross(salaryMonthly) * 12,
      );
    }
  }

  const pitEst = estimateAnnualPersonalIncomeTaxNg(taxableProfit);

  const vatRows = payables.filter((p) => p.taxType === "VAT");
  const whtRows = payables.filter((p) => p.taxType === "WHT");
  const payeRows = payables.filter((p) => p.taxType === "PAYE");
  const citRows = payables.filter((p) => p.taxType === "CIT");

  const vatDue = vatFilingDueIso(y, 12);
  const whtDue = vatFilingDueIso(y, 12);
  const payeDue = `${y}-04-18`;
  const citDue = `${y}-06-30`;

  const sections: Array<{
    id: string;
    label: string;
    status: SectionStatus;
    total: number;
    items: Array<{
      label: string;
      amount: number | null;
      isRate?: boolean;
      rateValue?: string;
    }>;
    dueDate: string;
    dueDateStatus: "overdue" | "upcoming" | "future";
  }> = [];

  sections.push({
    id: "vat",
    label: "Value Added Tax (VAT)",
    status:
      totalIncomeExVat < VAT_TURNOVER_THRESHOLD_NGN
        ? "computed"
        : payableSectionStatus(vatRows),
    total: netVat,
    items: [
      { label: "Output VAT on Sales", amount: outputVat },
      { label: "Input VAT on Purchases", amount: -inputVat },
    ],
    dueDate: vatDue,
    dueDateStatus: dueDateStatus(vatDue),
  });

  if (flags.paye) {
    sections.push({
      id: "paye",
      label: "Pay As You Earn (PAYE)",
      status: payableSectionStatus(payeRows),
      total: payeAnnual,
      items: [
        {
          label: "Employee tax (estimated from profile salary)",
          amount: payeAnnual,
        },
      ],
      dueDate: payeDue,
      dueDateStatus: dueDateStatus(payeDue),
    });
  }

  const whtItems: Array<{ label: string; amount: number }> = [];
  if (whtServices > 0)
    whtItems.push({
      label: "WHT on Professional Services",
      amount: whtServices,
    });
  if (whtRent > 0)
    whtItems.push({
      label: `WHT on Rent (${whtRentRate}%)`,
      amount: whtRent,
    });
  if (whtSurvey > 0)
    whtItems.push({ label: "WHT on Surveys (5%)", amount: whtSurvey });
  if (whtItems.length === 0 && whtTotal > 0)
    whtItems.push({ label: "Withholding Tax (estimated)", amount: whtTotal });

  sections.push({
    id: "wht",
    label: "Withholding Tax (WHT)",
    status: payableSectionStatus(whtRows),
    total: whtTotal,
    items: whtItems.length ? whtItems : [{ label: "WHT (no base)", amount: 0 }],
    dueDate: whtDue,
    dueDateStatus: dueDateStatus(whtDue),
  });

  sections.push({
    id: "cit",
    label: "Companies Income Tax (CIT)",
    status: citRows.length ? payableSectionStatus(citRows) : "computed",
    total: citLiability,
    items: [
      { label: "Taxable Profit (books proxy)", amount: taxableProfit },
      {
        label: "Tax Class",
        amount: null,
        isRate: true,
        rateValue: citEstimate.taxClassLabel,
      },
      {
        label: "CIT Rate",
        amount: null,
        isRate: true,
        rateValue: `${citEstimate.citRate}%`,
      },
      ...(citEstimate.developmentLevy > 0
        ? [
            {
              label: "Development Levy (4%)",
              amount: citEstimate.developmentLevy,
            },
          ]
        : []),
      { label: "CIT Liability (estimated)", amount: citEstimate.estimatedAnnualCit },
      { label: "Total CIT + Levy", amount: citLiability },
    ],
    dueDate: citDue,
    dueDateStatus: dueDateStatus(citDue),
  });

  if (flags.pit) {
    const pitDue = `${y}-03-31`;
    sections.push({
      id: "pit",
      label: "Personal Income Tax (PIT)",
      status: "computed",
      total: Math.round(pitEst.estimatedAnnualPitNgn),
      items: [
        {
          label: "Chargeable income proxy (annual)",
          amount: Math.round(pitEst.chargeableIncomeProxyAnnualNgn),
        },
        {
          label: "Estimated annual PIT",
          amount: Math.round(pitEst.estimatedAnnualPitNgn),
        },
      ],
      dueDate: pitDue,
      dueDateStatus: dueDateStatus(pitDue),
    });
  }

  const total = sections.reduce((s, sec) => s + sec.total, 0);

  const deductibleApprox = Math.round(
    expenses.reduce((s, e) => s + decimalToNumber(e.totalAmount), 0),
  );
  const insight =
    deductibleApprox > 0
      ? `Book expenses of about ${formatNgnShort(deductibleApprox)} reduce taxable profit before CIT/PIT estimates. VAT/WHT follow sales and service bases in-range.`
      : `Limited expense records in ${y}; tax estimates lean on declared revenue and defaults — add categorized expenses for tighter liability views.`;

  const breakdown = sections.map((sec) => ({
    taxType: sec.label.split("(")[1]?.replace(")", "").trim() || sec.label,
    description: sec.label,
    amount: sec.total,
    dueDate: sec.dueDate,
    status: sec.dueDateStatus === "overdue" ? "overdue" : "pending",
  }));
  const soon = breakdown.find((row) => row.status === "pending" && row.dueDate);
  return {
    insight,
    total,
    totalLiability: total,
    period: String(y),
    breakdown,
    sections,
    taxgptInsights: [
      {
        type: (soon ? "alert" : "insight") as "alert" | "insight",
        text: soon
          ? `${soon.description} of ₦${soon.amount.toLocaleString("en-NG")} is due ${soon.dueDate}. Ensure remittance is initiated.`
          : insight,
      },
    ],
    note: "All tax calculations are indicative estimates from mobile sales and expense books (FIRS-aligned rates where modeled). Reconcile filings, thresholds, and exemptions with a tax adviser before payment.",
  };
}

function previousRange(start: Date, end: Date): { prevStart: Date; prevEnd: Date } {
  const ms = end.getTime() - start.getTime() + 1;
  const prevEnd = new Date(start.getTime() - 1);
  prevEnd.setHours(23, 59, 59, 999);
  const prevStart = new Date(prevEnd.getTime() - ms + 1);
  prevStart.setHours(0, 0, 0, 0);
  return { prevStart, prevEnd };
}

function changePercent(curr: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export async function getClientRevenueAnalytics(
  linkedUserId: string,
  query: { dateFrom?: string; dateTo?: string; preset?: string },
) {
  const { start, end } = resolveInsightsDateRange(query);
  const { prevStart, prevEnd } = previousRange(start, end);

  const [sales, prevSales] = await Promise.all([
    prisma.sale.findMany({
      where: { userId: linkedUserId, saleDate: { gte: start, lte: end } },
    }),
    prisma.sale.findMany({
      where: { userId: linkedUserId, saleDate: { gte: prevStart, lte: prevEnd } },
    }),
  ]);

  const total = Math.round(
    sales.reduce((s, x) => s + decimalToNumber(x.totalAmount), 0),
  );

  const byCat: Record<string, number> = {};
  const prevByCat: Record<string, number> = {};
  for (const s of sales) {
    const c = s.category?.trim() || "Uncategorized";
    byCat[c] = (byCat[c] ?? 0) + decimalToNumber(s.totalAmount);
  }
  for (const s of prevSales) {
    const c = s.category?.trim() || "Uncategorized";
    prevByCat[c] = (prevByCat[c] ?? 0) + decimalToNumber(s.totalAmount);
  }

  const categories = Object.entries(byCat)
    .map(([label, amount]) => ({
      label,
      amount: Math.round(amount),
      changePercent: changePercent(
        amount,
        prevByCat[label] ?? 0,
      ),
    }))
    .sort((a, b) => b.amount - a.amount);

  const byCustomer = new Map<
    string,
    { revenue: number; transactions: number }
  >();
  for (const s of sales) {
    const name = s.customerName?.trim() || "Walk-in / unnamed";
    const cur = byCustomer.get(name) ?? { revenue: 0, transactions: 0 };
    cur.revenue += decimalToNumber(s.totalAmount);
    cur.transactions += 1;
    byCustomer.set(name, cur);
  }
  const topCustomers = [...byCustomer.entries()]
    .map(([name, v]) => ({
      name,
      revenue: Math.round(v.revenue),
      transactions: v.transactions,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const byStream = new Map<string, number>();
  for (const s of sales) {
    const label =
      s.itemName?.trim() || s.description?.trim() || "Sale";
    byStream.set(label, (byStream.get(label) ?? 0) + decimalToNumber(s.totalAmount));
  }
  const topStreams = [...byStream.entries()]
    .map(([label, amount]) => ({ label, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  const topLabel = topCustomers[0]?.name ?? "your customers";
  const topShare =
    total > 0 && topCustomers[0]
      ? Math.round((topCustomers[0].revenue / total) * 1000) / 10
      : 0;
  const insight =
    total > 0
      ? `${topLabel} represents about ${topShare}% of revenue in this range; category mix below shows where growth is concentrated.`
      : "No sales in this period — widen the date range or record income to populate revenue analytics.";

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const trendEnd = new Date(end);
  const trend: Array<{ month: string; revenue: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(trendEnd.getFullYear(), trendEnd.getMonth() - i, 1);
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const mEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
    const revenue = Math.round(
      sales
        .filter((s) => {
          const t = s.saleDate.getTime();
          return t >= mStart.getTime() && t <= mEnd.getTime();
        })
        .reduce((sum, s) => sum + decimalToNumber(s.totalAmount), 0),
    );
    trend.push({
      month: `${monthNames[d.getMonth()]} ${d.getFullYear()}`,
      revenue,
    });
  }

  return {
    insight,
    total,
    period: end.toLocaleString("en-GB", { month: "long", year: "numeric" }),
    totalRevenue: total,
    bySource: categories.map((c) => ({
      source: c.label,
      amount: c.amount,
      percent: total > 0 ? Math.round((c.amount / total) * 1000) / 10 : 0,
    })),
    trend,
    categories,
    topCustomers: topCustomers.map((c) => ({
      ...c,
      name: c.name,
      amount: c.revenue,
      invoiceCount: c.transactions,
    })),
    topStreams,
  };
}

export async function getClientExpenseIntelligence(
  linkedUserId: string,
  query: { dateFrom?: string; dateTo?: string; preset?: string },
) {
  const { start, end } = resolveInsightsDateRange(query);
  const { prevStart, prevEnd } = previousRange(start, end);

  const trendStart = new Date(end);
  trendStart.setMonth(trendStart.getMonth() - 5);
  trendStart.setDate(1);
  trendStart.setHours(0, 0, 0, 0);

  const [expenses, prevExpenses, trendExpenses] = await Promise.all([
    prisma.expense.findMany({
      where: { userId: linkedUserId, expenseDate: { gte: start, lte: end } },
    }),
    prisma.expense.findMany({
      where: {
        userId: linkedUserId,
        expenseDate: { gte: prevStart, lte: prevEnd },
      },
    }),
    prisma.expense.findMany({
      where: { userId: linkedUserId, expenseDate: { gte: trendStart, lte: end } },
    }),
  ]);

  const total = Math.round(
    expenses.reduce((s, e) => s + decimalToNumber(e.totalAmount), 0),
  );
  const prevTotal = prevExpenses.reduce(
    (s, e) => s + decimalToNumber(e.totalAmount),
    0,
  );

  const byCat: Record<string, number> = {};
  const prevByCat: Record<string, number> = {};
  for (const e of expenses) {
    const c = e.category?.trim() || "Other";
    byCat[c] = (byCat[c] ?? 0) + decimalToNumber(e.totalAmount);
  }
  for (const e of prevExpenses) {
    const c = e.category?.trim() || "Other";
    prevByCat[c] = (prevByCat[c] ?? 0) + decimalToNumber(e.totalAmount);
  }

  const nonDeductibleCats = new Set<string>();
  for (const e of expenses) {
    const label = `${e.category} ${e.description}`.toLowerCase();
    if (/penalt|fine|non-deduct/.test(label)) {
      nonDeductibleCats.add(e.category?.trim() || "Other");
    }
  }
  const categories = Object.entries(byCat)
    .map(([label, amount]) => ({
      label,
      category: label,
      amount: Math.round(amount),
      percent: total > 0 ? Math.round((amount / total) * 1000) / 10 : 0,
      deductible: !nonDeductibleCats.has(label),
      changePercent: changePercent(amount, prevByCat[label] ?? 0),
    }))
    .sort((a, b) => b.amount - a.amount);

  const monthlyTrend: Array<{ month: string; amount: number }> = [];
  const trendEnd = new Date(end);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(
      trendEnd.getFullYear(),
      trendEnd.getMonth() - i,
      1,
    );
    const mStart = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
    const mEnd = new Date(
      d.getFullYear(),
      d.getMonth() + 1,
      0,
      23,
      59,
      59,
      999,
    );
    const monthTotal = trendExpenses
      .filter((e) => {
        const t = e.expenseDate.getTime();
        return t >= mStart.getTime() && t <= mEnd.getTime();
      })
      .reduce((s, e) => s + decimalToNumber(e.totalAmount), 0);
    monthlyTrend.push({
      month: d.toLocaleString("en-US", { month: "short" }),
      amount: Math.round(monthTotal),
    });
  }

  const byVendor = new Map<
    string,
    { category: string; amount: number; transactions: number }
  >();
  for (const e of expenses) {
    const name = e.supplierName?.trim() || "Unspecified vendor";
    const cat = e.category?.trim() || "Other";
    const cur = byVendor.get(name) ?? {
      category: cat,
      amount: 0,
      transactions: 0,
    };
    cur.amount += decimalToNumber(e.totalAmount);
    cur.transactions += 1;
    cur.category = cat;
    byVendor.set(name, cur);
  }
  const topVendors = [...byVendor.entries()]
    .map(([name, v]) => ({
      name,
      category: v.category,
      amount: Math.round(v.amount),
      transactions: v.transactions,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);

  let maxCatDelta = 0;
  let maxCatLabel = "";
  for (const c of categories) {
    const p = c.changePercent;
    if (p != null && p > maxCatDelta) {
      maxCatDelta = p;
      maxCatLabel = c.label;
    }
  }
  const revDelta = changePercent(total, prevTotal);
  const alert =
    total > 0 && maxCatDelta > 12 && revDelta != null && maxCatDelta > revDelta + 15
      ? `${maxCatLabel} expenses moved about ${maxCatDelta}% vs the prior window while overall spend changed ${revDelta}%; review vendor contracts and category budgets.`
      : total > 0
        ? `Total expenses ${formatNgnShort(total)} in range; largest categories are listed below with period-over-period change where a prior window exists.`
        : "No expenses in this period — widen the date range to see trends.";

  const nonDeductibleTotal = categories
    .filter((c) => !c.deductible)
    .reduce((s, c) => s + c.amount, 0);
  return {
    alert,
    total,
    period: end.toLocaleString("en-GB", { month: "long", year: "numeric" }),
    totalExpenses: total,
    byCategory: categories,
    nonDeductibleTotal,
    nonDeductiblePercent:
      total > 0 ? Math.round((nonDeductibleTotal / total) * 1000) / 10 : 0,
    trend: monthlyTrend.map((row) => ({
      month: row.month,
      expenses: row.amount,
    })),
    taxgptAlerts:
      nonDeductibleTotal > 0
        ? [
            {
              type: "alert" as const,
              headline: `Non-deductible items at ${total > 0 ? Math.round((nonDeductibleTotal / total) * 1000) / 10 : 0}% of expenses`,
              body: `Non-deductible amounts of ₦${nonDeductibleTotal.toLocaleString("en-NG")} are not deductible under CITA and inflate the effective tax rate.`,
              suggestedAction:
                "Review underlying notices and consider an adjustment in Tax Computation.",
            },
          ]
        : [],
    categories,
    monthlyTrend,
    topVendors,
  };
}
