import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { isContractorEmployment } from "../../constants/employmentTypes";
import { isEmployeeActiveInPayrollPeriod } from "../../constants/payrollObligations";
import { isUndoneStatus } from "../../constants/recordUndo";
import {
  PERCENT,
  VAT_RATE_PERCENT,
  WHT_RATE_SERVICES_PERCENT,
} from "../../constants/percentages";
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
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { resolveEmployeePeriodAmounts } from "./prospectiveTermsService";
import {
  compareMonthKeys,
  currentMonthKey,
  dueDateLabelFromYmd,
  lagosTodayYmd,
  monthLabelFromKey,
  nextMonthKey,
  previousMonthKey,
} from "../../utils/lagosCalendar";
import { isFilingCompliant, overviewFilingStatusFromRow } from "../../constants/filingStatusRules";
import { VAT_FILING_DAY } from "../../constants/taxPayable";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parsePeriodKey(period: unknown): string {
  const raw = Array.isArray(period) ? period[0] : period;
  if (raw == null || typeof raw !== "string") {
    throw new HttpReplyError(400, "period is required (YYYY-MM)");
  }
  const match = raw.trim().match(/^(\d{4})-(\d{1,2})$/);
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

/**
 * VAT/WHT viewable periods (Africa/Lagos calendar):
 * previous months → allowed; current month → allowed (in-progress MTD);
 * future months → rejected.
 */
function assertPeriodViewable(periodKey: string): void {
  const current = currentMonthKey();
  if (compareMonthKeys(periodKey, current) > 0) {
    throw new HttpReplyError(400, "period cannot be after the current month");
  }
}

function dueDateYmd(periodKey: string): string {
  const next = nextMonthKey(periodKey);
  return `${next}-${String(VAT_FILING_DAY).padStart(2, "0")}`;
}

function calendarKeys(): string[] {
  const keys: string[] = [];
  let cursor = currentMonthKey();
  for (let i = 0; i < 6; i++) {
    keys.push(cursor);
    cursor = previousMonthKey(cursor);
  }
  return keys;
}

function overviewFilingStatus(row: {
  submittedAt: Date | null;
  status: string;
  completedSteps?: unknown;
} | null, dueYmd: string): "Pending" | "Overdue" | "Filed" {
  return overviewFilingStatusFromRow(row, dueYmd, lagosTodayYmd());
}

function workspaceMeta(row: {
  currentStep: number;
  submittedAt: Date | null;
  status: string;
  completedSteps?: unknown;
} | null): { workspaceStep: number; workspaceTitle: string; workspaceTotal: number } {
  let step = row?.currentStep ?? 1;
  if (row && isFilingCompliant(row)) step = 12;
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
  const { year, month } = splitPeriod(periodKey);
  const { start, end } = monthDateRangeUtc(year, month);
  const dateRange = { gte: start, lte: end };

  const [periodSales, periodExpenses] = await Promise.all([
    prisma.sale.findMany({
      where: liveSaleWhere(userId, dateRange),
      select: {
        amount: true,
        vatAmount: true,
        vatableIncome: true,
        saleDate: true,
      },
    }),
    prisma.expense.findMany({
      where: liveExpenseWhere(userId, dateRange),
      select: {
        vatAmount: true,
        vatInclusive: true,
        expenseDate: true,
      },
    }),
  ]);

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

function matchesPeriodKey(dateStr: string, periodKey: string): boolean {
  const match = dateStr.trim().match(/^(\d{4})-(\d{1,2})/);
  if (!match) return false;
  const key = `${match[1]}-${String(Number(match[2])).padStart(2, "0")}`;
  return key === periodKey;
}

type WhtPayeeRow = {
  id: string;
  name: string;
  entity: string;
  entityLabel: string;
  classId: string;
  classLabel: string;
  rate: number;
  gross: number;
  wht: number;
  remittanceStatus: "pending" | "remitted";
  supplierId: string;
  description: string;
};

function toWhtPayee(input: {
  id: string;
  name: string;
  entityType: string;
  residency: string;
  whtClass: string;
  rate: number;
  gross: number;
  wht: number;
  remittanceStatus: "pending" | "remitted";
  supplierId: string;
  description: string;
}): WhtPayeeRow | null {
  const wht = normalizeMoneyAmount(input.wht);
  const gross = round2(input.gross);
  if (wht <= 0) return null;
  const classId = toWhtClassId(input.whtClass);
  const { entity, entityLabel } = entityFields(
    input.entityType,
    input.residency,
  );
  return {
    id: input.id,
    name: input.name,
    entity,
    entityLabel,
    classId,
    classLabel: whtClassLabel(classId),
    rate: input.rate,
    gross,
    wht,
    remittanceStatus: input.remittanceStatus,
    supplierId: input.supplierId,
    description: input.description,
  };
}

async function loadWhtPayees(
  userId: string,
  periodKey: string,
): Promise<WhtPayeeRow[]> {
  const { year, month } = splitPeriod(periodKey);
  const [transactions, vendorPayments, employees] = await Promise.all([
    prisma.beneficiaryTransaction.findMany({
      where: {
        beneficiary: { userId, voided: false },
        OR: [{ whtAmount: { gt: 0 } }, { whtRate: { gt: 0 } }],
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
    }),
    prisma.vendorPayment.findMany({
      where: {
        userId,
        periodYear: year,
        periodMonth: month,
        OR: [{ whtDeducted: { gt: 0 } }, { whtRate: { gt: 0 } }],
      },
    }),
    prisma.employee.findMany({ where: { userId } }),
  ]);

  const payees: WhtPayeeRow[] = [];

  for (const txn of transactions) {
    if (isUndoneStatus(txn.status)) continue;
    if (!matchesPeriodKey(txn.date, periodKey)) continue;
    if (txn.entryType === "INVOICE" && txn.invoiceStatus === "PAID") continue;
    if (txn.entryType !== "PAYMENT" && txn.entryType !== "INVOICE") continue;
    const rate = d(txn.whtRate);
    const gross = d(txn.grossAmount);
    const wht =
      d(txn.whtAmount) > 0
        ? d(txn.whtAmount)
        : round2((gross * rate) / PERCENT);
    const row = toWhtPayee({
      id: txn.id,
      name: txn.beneficiary.name,
      entityType: txn.beneficiary.entityType,
      residency: txn.beneficiary.residency,
      whtClass: txn.whtClass,
      rate,
      gross,
      wht,
      remittanceStatus: txn.status === "REMITTED" ? "remitted" : "pending",
      supplierId: txn.beneficiaryId,
      description: txn.description,
    });
    if (row) payees.push(row);
  }

  for (const vendor of vendorPayments) {
    const rate = d(vendor.whtRate);
    const gross = d(vendor.grossAmount);
    const wht =
      d(vendor.whtDeducted) > 0
        ? d(vendor.whtDeducted)
        : round2((gross * rate) / PERCENT);
    const row = toWhtPayee({
      id: vendor.id,
      name: vendor.vendorName,
      entityType: "CORPORATE",
      residency: "RESIDENT",
      whtClass: vendor.category,
      rate,
      gross,
      wht,
      remittanceStatus: "pending",
      supplierId: vendor.id,
      description: vendor.description,
    });
    if (row) payees.push(row);
  }

  const includedNames = new Set(
    payees.map((p) => p.name.trim().toLowerCase()).filter(Boolean),
  );

  for (const employee of employees) {
    if (!isContractorEmployment(employee.employmentType)) continue;
    if (!isEmployeeActiveInPayrollPeriod(employee.startDate, periodKey)) {
      continue;
    }
    if (includedNames.has(employee.fullName.trim().toLowerCase())) continue;
    const amounts = await resolveEmployeePeriodAmounts(
      userId,
      employee.id,
      periodKey,
      false,
      employee.startDate,
    );
    if (!amounts || amounts.gross <= 0) continue;
    const rate = WHT_RATE_SERVICES_PERCENT;
    const row = toWhtPayee({
      id: employee.id,
      name: employee.fullName,
      entityType: "INDIVIDUAL",
      residency: "RESIDENT",
      whtClass: "PROFESSIONAL_FEES",
      rate,
      gross: amounts.gross,
      wht: (amounts.gross * rate) / PERCENT,
      remittanceStatus: "pending",
      supplierId: employee.id,
      description: "Contractor WHT (professional fees)",
    });
    if (row) {
      payees.push(row);
      includedNames.add(employee.fullName.trim().toLowerCase());
    }
  }

  return payees.sort((a, b) => b.wht - a.wht);
}

export async function computeWhtFigures(userId: string, periodKey: string) {
  const payees = await loadWhtPayees(userId, periodKey);

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
  const pendingAmount = round2(
    payees
      .filter((p) => p.remittanceStatus !== "remitted")
      .reduce((s, p) => s + p.wht, 0),
  );
  const remittedAmount = round2(
    payees
      .filter((p) => p.remittanceStatus === "remitted")
      .reduce((s, p) => s + p.wht, 0),
  );
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
    assertPeriodViewable(key);
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
