import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { isUndoneStatus } from "../../constants/recordUndo";
import { VAT_RATE_PERCENT } from "../../constants/percentages";
import {
  TAX_AUTHORITY,
  TAX_PORTAL_NAME,
  VAT_FORM_NAME,
  VAT_FORM_SHORT,
  WHT_FORM_NAME,
  WORKSPACE_STEP_TITLES,
  WORKSPACE_TOTAL_STEPS,
  toWhtClassId,
  whtClassLabel,
} from "../../constants/vatWhtOverview";
import { HttpReplyError } from "../../utils/httpReplyError";
import { liveExpenseWhere, liveSaleWhere } from "../../utils/liveBookQuery";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import {
  compareMonthKeys,
  dueDateLabelFromYmd,
  lagosTodayYmd,
  monthKeyFromDate,
  monthLabelFromKey,
  nextMonthKey,
  openFilingMonthKey,
  previousMonthKey,
} from "../../utils/lagosCalendar";
import { VAT_FILING_DAY } from "../../constants/taxPayable";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parsePeriodKey(period: unknown): string {
  if (period == null || typeof period !== "string") {
    throw new HttpReplyError(400, "period is required (YYYY-MM)");
  }
  const match = period.trim().match(/^(\d{4})-(\d{1,2})$/);
  if (!match) {
    throw new HttpReplyError(400, "period must be YYYY-MM");
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new HttpReplyError(400, "period must be YYYY-MM");
  }
  return `${year}-${String(month).padStart(2, "0")}`;
}

function assertPeriodOpen(periodKey: string): void {
  const open = openFilingMonthKey();
  if (compareMonthKeys(periodKey, open) > 0) {
    throw new HttpReplyError(400, "period cannot be after the open filing month");
  }
}

function dueDateYmd(periodKey: string): string {
  const next = nextMonthKey(periodKey);
  return `${next}-${String(VAT_FILING_DAY).padStart(2, "0")}`;
}

function calendarKeys(): string[] {
  const keys: string[] = [];
  let cursor = openFilingMonthKey();
  for (let i = 0; i < 6; i++) {
    keys.push(cursor);
    cursor = previousMonthKey(cursor);
  }
  return keys;
}

function overviewFilingStatus(row: {
  submittedAt: Date | null;
  status: string;
} | null, dueYmd: string): "Pending" | "Overdue" | "Filed" {
  if (row?.submittedAt || row?.status === "paid" || row?.status === "overpaid") {
    return "Filed";
  }
  const today = lagosTodayYmd();
  if (dueYmd < today) return "Overdue";
  return "Pending";
}

function workspaceMeta(row: {
  currentStep: number;
  submittedAt: Date | null;
  status: string;
} | null): { workspaceStep: number; workspaceTitle: string; workspaceTotal: number } {
  let step = row?.currentStep ?? 1;
  if (row?.status === "paid" || row?.status === "overpaid") step = 12;
  else if (row?.submittedAt) step = Math.max(step, 8);
  step = Math.min(12, Math.max(1, step));
  return {
    workspaceStep: step,
    workspaceTotal: WORKSPACE_TOTAL_STEPS,
    workspaceTitle: WORKSPACE_STEP_TITLES[step] ?? "Tax Computation",
  };
}

function splitPeriod(periodKey: string): { year: number; month: number } {
  const [y, m] = periodKey.split("-").map(Number);
  return { year: y!, month: m! };
}

async function profileFields(userId: string) {
  const business = await prisma.business.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      tin: true,
      stateOfResidence: true,
    },
  });
  const draft = await prisma.filingDraft.findFirst({
    where: { userId, taxType: "VAT" },
    orderBy: { updatedAt: "desc" },
    select: { vatRegistrationNumber: true, stateOfOperation: true },
  });
  return {
    tin: business?.tin ?? null,
    stateOfOperation: draft?.stateOfOperation ?? business?.stateOfResidence ?? null,
    vatRegistrationNumber: draft?.vatRegistrationNumber ?? null,
  };
}

async function loadPayable(
  userId: string,
  taxType: "VAT" | "WHT",
  periodKey: string,
) {
  const { year, month } = splitPeriod(periodKey);
  return prisma.taxPayable.findUnique({
    where: {
      userId_taxType_periodYear_periodMonth: {
        userId,
        taxType,
        periodYear: year,
        periodMonth: month,
      },
    },
  });
}

export async function computeVatFigures(userId: string, periodKey: string) {
  const sales = await prisma.sale.findMany({
    where: liveSaleWhere(userId),
    select: {
      amount: true,
      vatAmount: true,
      vatableIncome: true,
      saleDate: true,
    },
  });
  const expenses = await prisma.expense.findMany({
    where: liveExpenseWhere(userId),
    select: {
      vatAmount: true,
      vatInclusive: true,
      expenseDate: true,
    },
  });

  const periodSales = sales.filter((s) => monthKeyFromDate(s.saleDate) === periodKey);
  const periodExpenses = expenses.filter(
    (e) => monthKeyFromDate(e.expenseDate) === periodKey,
  );

  const vatableSales = round2(
    periodSales
      .filter((s) => s.vatableIncome === true)
      .reduce((sum, s) => sum + d(s.amount), 0),
  );
  const nonVatableSales = round2(
    periodSales
      .filter((s) => s.vatableIncome !== true)
      .reduce((sum, s) => sum + d(s.amount), 0),
  );
  const totalSales = round2(vatableSales + nonVatableSales);
  const outputVat = round2((vatableSales * VAT_RATE_PERCENT) / 100);
  const inputVat = round2(
    periodExpenses
      .filter((e) => e.vatInclusive && e.vatAmount != null)
      .reduce((sum, e) => sum + d(e.vatAmount), 0),
  );
  const netVatPayable = round2(Math.max(0, outputVat - inputVat));
  const salesInvoiceCount = periodSales.length;
  const purchaseInvoiceCount = periodExpenses.filter(
    (e) => e.vatInclusive && e.vatAmount != null && d(e.vatAmount) > 0,
  ).length;

  return {
    rate: VAT_RATE_PERCENT,
    vatableSales,
    nonVatableSales,
    totalSales,
    outputVat,
    inputVat,
    inputVatClaimable: inputVat,
    netVatPayable,
    salesInvoiceCount,
    purchaseInvoiceCount,
  };
}

function entityFields(entityType: string, residency: string) {
  const corporate = entityType.toUpperCase() === "CORPORATE";
  const nonResident = residency.toUpperCase() === "NON_RESIDENT";
  const entity = corporate ? "corporate" : "individual";
  let entityLabel = corporate ? "Company" : "Individual";
  if (nonResident) {
    entityLabel = corporate ? "Non-resident company" : "Non-resident individual";
  }
  return { entity, entityLabel };
}

async function loadWhtPayments(userId: string, periodKey: string) {
  const payments = await prisma.beneficiaryTransaction.findMany({
    where: {
      entryType: "PAYMENT",
      status: { not: "VOID" },
      beneficiary: { userId, voided: false },
      whtAmount: { gt: 0 },
    },
    include: {
      beneficiary: {
        select: {
          id: true,
          name: true,
          entityType: true,
          residency: true,
        },
      },
    },
  });

  return payments
    .filter((p) => !isUndoneStatus(p.status))
    .filter((p) => {
      const key = p.date.length >= 7 ? p.date.slice(0, 7) : "";
      return key === periodKey;
    });
}

export async function computeWhtFigures(userId: string, periodKey: string) {
  const payments = await loadWhtPayments(userId, periodKey);
  const payees = payments
    .map((p) => {
      const { entity, entityLabel } = entityFields(
        p.beneficiary.entityType,
        p.beneficiary.residency,
      );
      const classId = toWhtClassId(p.whtClass);
      return {
        id: p.id,
        name: p.beneficiary.name,
        entity,
        entityLabel,
        classId,
        classLabel: whtClassLabel(classId),
        rate: d(p.whtRate),
        gross: round2(d(p.grossAmount)),
        wht: normalizeMoneyAmount(d(p.whtAmount)),
        remittanceStatus: "pending" as const,
        supplierId: p.beneficiaryId,
        description: p.description,
      };
    })
    .sort((a, b) => b.wht - a.wht);

  const classMap = new Map<
    string,
    {
      id: string;
      classId: string;
      label: string;
      rate: number;
      payees: number;
      gross: number;
      wht: number;
    }
  >();
  for (const payee of payees) {
    const id = `${payee.classId}:${payee.rate}`;
    const existing = classMap.get(id);
    if (!existing) {
      classMap.set(id, {
        id,
        classId: payee.classId,
        label: payee.classLabel,
        rate: payee.rate,
        payees: 1,
        gross: payee.gross,
        wht: payee.wht,
      });
    } else {
      existing.payees += 1;
      existing.gross = round2(existing.gross + payee.gross);
      existing.wht = round2(existing.wht + payee.wht);
    }
  }

  const totalGross = round2(payees.reduce((s, p) => s + p.gross, 0));
  const totalWht = round2(payees.reduce((s, p) => s + p.wht, 0));
  const corporateAmount = round2(
    payees.filter((p) => p.entity === "corporate").reduce((s, p) => s + p.wht, 0),
  );
  const individualAmount = round2(
    payees.filter((p) => p.entity === "individual").reduce((s, p) => s + p.wht, 0),
  );
  const companyPayees = payees.filter((p) => p.entity === "corporate").length;
  const individualPayees = payees.filter((p) => p.entity === "individual").length;
  const pendingAmount = totalWht;
  const remittedAmount = 0;
  const hasCorp = companyPayees > 0;
  const hasInd = individualPayees > 0;
  let whtType = "mixed";
  if (hasCorp && !hasInd) whtType = "corporate";
  if (!hasCorp && hasInd) whtType = "individual";
  if (!hasCorp && !hasInd) whtType = "mixed";

  return {
    totalGross,
    totalWht,
    corporateAmount,
    individualAmount,
    pendingAmount,
    remittedAmount,
    payeeCount: payees.length,
    companyPayees,
    individualPayees,
    classes: [...classMap.values()],
    payees,
    whtType,
    vendors: payees.map((p) => ({
      supplierId: p.supplierId,
      supplierName: p.name,
      description: p.description,
      category: p.classId,
      grossAmount: p.gross,
      whtRate: p.rate,
      whtDeducted: p.wht,
    })),
  };
}

export const vatWhtOverviewService = {
  parseAndGuardPeriod(period: unknown): string {
    const key = parsePeriodKey(period);
    assertPeriodOpen(key);
    return key;
  },

  async getVatOverview(userId: string, period: unknown) {
    const periodKey = this.parseAndGuardPeriod(period);
    const { year, month } = splitPeriod(periodKey);
    const dueDate = dueDateYmd(periodKey);
    const [figures, profile, payable] = await Promise.all([
      computeVatFigures(userId, periodKey),
      profileFields(userId),
      loadPayable(userId, "VAT", periodKey),
    ]);
    const filingStatus = overviewFilingStatus(payable, dueDate);
    const workspace = workspaceMeta(payable);
    const calendar = await Promise.all(
      calendarKeys().map(async (key) => {
        const due = dueDateYmd(key);
        const row = await loadPayable(userId, "VAT", key);
        const fig = await computeVatFigures(userId, key);
        return {
          period: key,
          periodLabel: monthLabelFromKey(key),
          filingStatus: overviewFilingStatus(row, due),
          dueDateLabel: dueDateLabelFromYmd(due),
          netVatPayable: fig.netVatPayable,
        };
      }),
    );

    return {
      period: periodKey,
      periodYear: year,
      periodMonth: month,
      periodLabel: monthLabelFromKey(periodKey),
      dueDate,
      dueDateLabel: dueDateLabelFromYmd(dueDate),
      filingStatus,
      tin: profile.tin,
      formName: VAT_FORM_NAME,
      formShort: VAT_FORM_SHORT,
      authority: TAX_AUTHORITY,
      portalName: TAX_PORTAL_NAME,
      rate: figures.rate,
      vatableSales: figures.vatableSales,
      nonVatableSales: figures.nonVatableSales,
      totalSales: figures.totalSales,
      outputVat: figures.outputVat,
      inputVat: figures.inputVat,
      netVatPayable: figures.netVatPayable,
      salesInvoiceCount: figures.salesInvoiceCount,
      purchaseInvoiceCount: figures.purchaseInvoiceCount,
      ...workspace,
      supplyMix: [
        { id: "vatable", label: "Vatable sales", amount: figures.vatableSales },
        { id: "non_vatable", label: "Not vatable", amount: figures.nonVatableSales },
      ],
      calendar,
    };
  },

  async getVatCalculation(userId: string, period: unknown) {
    const periodKey = this.parseAndGuardPeriod(period);
    const { year, month } = splitPeriod(periodKey);
    const dueDate = dueDateYmd(periodKey);
    const [figures, profile, payable] = await Promise.all([
      computeVatFigures(userId, periodKey),
      profileFields(userId),
      loadPayable(userId, "VAT", periodKey),
    ]);
    return {
      period: { year, month, label: monthLabelFromKey(periodKey) },
      stateOfOperation: profile.stateOfOperation,
      vatRegistrationNumber: profile.vatRegistrationNumber,
      dueDate,
      rate: figures.rate,
      vatableSales: figures.vatableSales,
      nonVatableSales: figures.nonVatableSales,
      totalSales: figures.totalSales,
      outputVat: figures.outputVat,
      inputVatClaimable: figures.inputVatClaimable,
      netVatPayable: figures.netVatPayable,
      salesInvoiceCount: figures.salesInvoiceCount,
      purchaseInvoiceCount: figures.purchaseInvoiceCount,
      filingStatus: overviewFilingStatus(payable, dueDate),
      breakdown: {
        outputVat: figures.outputVat,
        inputVatClaimable: figures.inputVatClaimable,
        netVatPayable: figures.netVatPayable,
      },
    };
  },

  async getWhtOverview(userId: string, period: unknown) {
    const periodKey = this.parseAndGuardPeriod(period);
    const { year, month } = splitPeriod(periodKey);
    const dueDate = dueDateYmd(periodKey);
    const [figures, profile, payable] = await Promise.all([
      computeWhtFigures(userId, periodKey),
      profileFields(userId),
      loadPayable(userId, "WHT", periodKey),
    ]);
    const calendar = await Promise.all(
      calendarKeys().map(async (key) => {
        const due = dueDateYmd(key);
        const row = await loadPayable(userId, "WHT", key);
        const fig = await computeWhtFigures(userId, key);
        return {
          period: key,
          periodLabel: monthLabelFromKey(key),
          filingStatus: overviewFilingStatus(row, due),
          dueDateLabel: dueDateLabelFromYmd(due),
          totalWht: fig.totalWht,
        };
      }),
    );
    return {
      period: periodKey,
      periodYear: year,
      periodMonth: month,
      periodLabel: monthLabelFromKey(periodKey),
      dueDate,
      dueDateLabel: dueDateLabelFromYmd(dueDate),
      filingStatus: overviewFilingStatus(payable, dueDate),
      tin: profile.tin,
      formName: WHT_FORM_NAME,
      authority: TAX_AUTHORITY,
      portalName: TAX_PORTAL_NAME,
      totalGross: figures.totalGross,
      totalWht: figures.totalWht,
      corporateAmount: figures.corporateAmount,
      individualAmount: figures.individualAmount,
      pendingAmount: figures.pendingAmount,
      remittedAmount: figures.remittedAmount,
      payeeCount: figures.payeeCount,
      companyPayees: figures.companyPayees,
      individualPayees: figures.individualPayees,
      ...workspaceMeta(payable),
      classes: figures.classes,
      payees: figures.payees.map(({ supplierId, description, ...payee }) => {
        void supplierId;
        void description;
        return payee;
      }),
      calendar,
    };
  },

  async getWhtSchedule(userId: string, period: unknown) {
    const periodKey = this.parseAndGuardPeriod(period);
    const { year, month } = splitPeriod(periodKey);
    const dueDate = dueDateYmd(periodKey);
    const [figures, payable] = await Promise.all([
      computeWhtFigures(userId, periodKey),
      loadPayable(userId, "WHT", periodKey),
    ]);
    return {
      periodYear: year,
      periodMonth: month,
      periodLabel: monthLabelFromKey(periodKey),
      whtType: figures.whtType,
      dueDate,
      filingStatus: overviewFilingStatus(payable, dueDate),
      totalGross: figures.totalGross,
      totalWht: figures.totalWht,
      corporateAmount: figures.corporateAmount,
      individualAmount: figures.individualAmount,
      vendors: figures.vendors,
    };
  },
};
