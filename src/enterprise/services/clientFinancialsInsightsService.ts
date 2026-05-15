import { prisma } from "../../config/database";
import { Decimal } from "@prisma/client/runtime/library";
import {
  PERCENT,
  WHT_RATE_SERVICES_PERCENT,
  CIT_RATE_SMALL_COMPANY_PERCENT,
  VAT_TURNOVER_THRESHOLD_NGN,
} from "../../constants/percentages";
import { estimateAnnualPersonalIncomeTaxNg } from "../../constants/pitComputation";
import { computePayeMonthly } from "../../constants/payroll";
import { buildTaxPersonaGuidancePayload } from "../../constants/taxPersona";
import { VAT_FILING_DAY } from "../../constants/taxPayable";
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
  return `₦${Math.round(n).toLocaleString("en-NG")}`;
}

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

function expenseBucket(
  category: string | null | undefined,
  description: string,
): "salary" | "tax" | "inventory" | "rent" | "utility" | "marketing" | "investing" | "operating" {
  const c = norm(category);
  const d = norm(description);
  const hay = `${c} ${d}`;
  if (/(equipment|machinery|vehicle|capital\s*exp|fixed\s*asset)/i.test(hay))
    return "investing";
  if (/(salary|payroll|staff|wage|benefit)/i.test(hay)) return "salary";
  if (/(vat|wht|withhold|tax\s*pay|firs|remittance)/i.test(hay)) return "tax";
  if (/(inventory|cogs|stock|suppl(y|ies)|goods|materials|purchase)/i.test(hay))
    return "inventory";
  if (/(rent|lease)/i.test(hay)) return "rent";
  if (/(utility|utilities|power|electric|energy|water|internet)/i.test(hay))
    return "utility";
  if (/(marketing|advert|ads|promo)/i.test(hay)) return "marketing";
  return "operating";
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

  const [sales, expenses] = await Promise.all([
    prisma.sale.findMany({
      where: { userId: linkedUserId, saleDate: { gte: start, lte: end } },
    }),
    prisma.expense.findMany({
      where: { userId: linkedUserId, expenseDate: { gte: start, lte: end } },
    }),
  ]);

  const customerPayments = sales.reduce(
    (s, x) => s + decimalToNumber(x.totalAmount),
    0,
  );

  let supplier = 0;
  let salary = 0;
  let tax = 0;
  let operating = 0;
  let investingOut = 0;
  let investingIn = 0;

  for (const e of expenses) {
    const amt = decimalToNumber(e.totalAmount);
    const b = expenseBucket(e.category, e.description);
    switch (b) {
      case "inventory":
        supplier += amt;
        break;
      case "salary":
        salary += amt;
        break;
      case "tax":
        tax += amt;
        break;
      case "investing":
        investingOut += amt;
        break;
      case "rent":
      case "utility":
      case "marketing":
      case "operating":
        operating += amt;
        break;
      default:
        operating += amt;
    }
  }

  const operatingItems = [
    {
      label: "Customer Payments",
      description: "Cash received from sales",
      amount: Math.round(customerPayments),
    },
    {
      label: "Supplier Payments",
      description: "Inventory and supplies",
      amount: supplier > 0 ? -Math.round(supplier) : 0,
    },
    {
      label: "Salary Payments",
      description: "Staff salaries and benefits",
      amount: salary > 0 ? -Math.round(salary) : 0,
    },
    {
      label: "Operating Expenses",
      description: "Rent, utilities, software, and other operating costs",
      amount: operating > 0 ? -Math.round(operating) : 0,
    },
    {
      label: "Tax Payments",
      description: "VAT, WHT, and other tax remittances recorded as expenses",
      amount: tax > 0 ? -Math.round(tax) : 0,
    },
  ];

  const operatingTotal = operatingItems.reduce((s, i) => s + i.amount, 0);

  const investingItems: Array<{
    label: string;
    description: string;
    amount: number;
  }> = [];
  if (investingOut > 0) {
    investingItems.push({
      label: "Equipment Purchases",
      description: "Machinery, vehicles, and capital items (from expense labels)",
      amount: -Math.round(investingOut),
    });
  }
  if (investingIn > 0) {
    investingItems.push({
      label: "Asset Sales",
      description: "Proceeds from disposal of assets (when tracked)",
      amount: Math.round(investingIn),
    });
  }

  const investingTotal = investingItems.reduce((s, i) => s + i.amount, 0);

  const financingItems: Array<{
    label: string;
    description: string;
    amount: number;
  }> = [];
  const financingTotal = 0;

  const netCashPosition = Math.round(
    operatingTotal + investingTotal + financingTotal,
  );

  const insight =
    netCashPosition >= 0
      ? `Operating movement of ${formatNgnShort(operatingTotal)} across the selected period; net cash position ${formatNgnShort(netCashPosition)} after investing (${formatNgnShort(investingTotal)}). Financing flows are not modeled from books until loan/owner records exist.`
      : `Net cash used in the period totals ${formatNgnShort(Math.abs(netCashPosition))}; review supplier, salary, and tax outflows against customer receipts.`;

  return {
    insight,
    operating: { total: operatingTotal, items: operatingItems },
    investing: { total: investingTotal, items: investingItems },
    financing: { total: financingTotal, items: financingItems },
    netCashPosition,
  };
}

export async function getClientTaxLiability(linkedUserId: string, year: number) {
  const y = Number.isFinite(year) ? year : new Date().getFullYear();
  const start = new Date(y, 0, 1, 0, 0, 0, 0);
  const end = new Date(y, 11, 31, 23, 59, 59, 999);

  const [sales, expenses, user, payables] = await Promise.all([
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
  ]);

  const guidance = buildTaxPersonaGuidancePayload(
    user?.taxPersona ?? null,
    user?.solopreneurRegistration ?? null,
  );
  const flags = guidance.applicableTaxes;

  const totalIncome = sales.reduce(
    (s, x) => s + decimalToNumber(x.totalAmount),
    0,
  );
  const outputVat = sales.reduce((s, x) => s + decimalToNumber(x.vatAmount), 0);
  const serviceIncome = sales
    .filter((x) => x.serviceIncome)
    .reduce((s, x) => s + decimalToNumber(x.amount), 0);
  const totalExpenses = expenses.reduce(
    (s, x) => s + decimalToNumber(x.totalAmount),
    0,
  );
  const inputVat = expenses.reduce(
    (s, x) => s + decimalToNumber(x.vatAmount),
    0,
  );
  const netProfit = totalIncome - totalExpenses;
  const taxableProfit = Math.max(0, Math.round(netProfit));
  const citLiability = Math.round(
    (taxableProfit * CIT_RATE_SMALL_COMPANY_PERCENT) / PERCENT,
  );

  const whtServices = Math.round(
    (serviceIncome * WHT_RATE_SERVICES_PERCENT) / PERCENT,
  );
  let whtRent = 0;
  let whtSurvey = 0;
  for (const e of expenses) {
    const base = decimalToNumber(e.amount);
    const c = norm(e.category);
    const h = `${c} ${norm(e.description)}`;
    if (/(rent|lease)/i.test(h)) whtRent += Math.round((base * 5) / PERCENT);
    else if (/survey/i.test(h))
      whtSurvey += Math.round((base * 5) / PERCENT);
  }
  const whtTotal = whtServices + whtRent + whtSurvey;

  const netVat = Math.round(outputVat - inputVat);

  const salaryMonthly =
    user?.employmentGrossSalaryMonthly != null
      ? decimalToNumber(user.employmentGrossSalaryMonthly)
      : 0;
  const payeAnnual =
    flags.paye && salaryMonthly > 0
      ? Math.round(computePayeMonthly(salaryMonthly * 12) * 12)
      : 0;

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
      totalIncome < VAT_TURNOVER_THRESHOLD_NGN
        ? "computed"
        : payableSectionStatus(vatRows),
    total: netVat,
    items: [
      { label: "Output VAT on Sales", amount: Math.round(outputVat) },
      { label: "Input VAT on Purchases", amount: -Math.round(inputVat) },
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
    whtItems.push({ label: "WHT on Rent (5%)", amount: whtRent });
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
        label: "Tax Rate",
        amount: null,
        isRate: true,
        rateValue: `${CIT_RATE_SMALL_COMPANY_PERCENT}%`,
      },
      { label: "CIT Liability (estimated)", amount: citLiability },
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

  return {
    insight,
    total,
    sections,
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

  return {
    insight,
    total,
    categories,
    topCustomers,
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

  const categories = Object.entries(byCat)
    .map(([label, amount]) => ({
      label,
      amount: Math.round(amount),
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

  return {
    alert,
    total,
    categories,
    monthlyTrend,
    topVendors,
  };
}
