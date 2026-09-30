import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { computeAssetDepreciation } from "../../constants/assetDepreciation";
import {
  DEFAULT_EMPLOYEE_PENSION_RATE,
  type EmployerPaymentFrequency,
  type EmployerPaymentMethod,
  type EmployerRelationship,
  type EmployerTaxTreatment,
  type EmployerType,
} from "../../constants/employer";
import { isContractorEmployment } from "../../constants/employmentTypes";
import type { PitDraftInputs } from "../../constants/filingWorkspace";
import { PENSION_EMPLOYEE_RATE, PENSION_EMPLOYER_RATE } from "../../constants/payroll";
import { isEmployeeActiveInPayrollPeriod } from "../../constants/payrollObligations";
import { PIT_PERIOD_MONTH } from "../../constants/pitFiling";
import { RECEIVABLE_TYPES } from "../../constants/receivables";
import { isUndoneStatus } from "../../constants/recordUndo";
import { capitalAllowanceService } from "../../mobile/services/capitalAllowanceService";
import { employersService } from "../../mobile/services/employersService";
import { inventoryService } from "../../mobile/services/inventoryService";
import { resolveEmployeePeriodAmounts } from "../../mobile/services/prospectiveTermsService";
import { userService } from "../../mobile/services/userService";
import { lagosYear } from "../../utils/lagosCalendar";
import { naira } from "./taxStatementMath";
import { inPeriod, statementPeriod, ymdFromDate } from "./taxStatementPeriod";
import type { TaxStatementPeriod } from "./taxStatementTypes";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}

function payloadObject(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  return {};
}

export type StatementSale = {
  category: string | null;
  amount: number;
  date: string;
};

export type StatementExpense = {
  category: string;
  expenseType: string;
  amount: number;
  date: string;
};

export type StatementPayerTx = {
  category: string;
  purpose: string;
  amount: number;
  date: string;
  status: string;
  whtApplicable: boolean;
  whtRate: number;
};

export type StatementReceivable = {
  incomeType: string;
  incomeAmount: number;
  incomeAccrualDate: string | null;
  whtDeducted: number;
  status: string;
  recordStatus: string;
};

export type StatementPrepaymentRec = {
  category: string;
  amount: number;
  date: string;
};

export type StatementEmployer = {
  id: string;
  employerType: EmployerType;
  relationship: EmployerRelationship;
  startDate: string;
  endDate: string | null;
  paymentMethod: EmployerPaymentMethod;
  paymentFrequency: EmployerPaymentFrequency;
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  bonuses: number;
  commissions: number;
  hasPension: boolean;
  employeeRate: number | null;
  taxTreatment: EmployerTaxTreatment;
  payeCredit: number;
  whtRate: number;
  historyEntries: Array<{
    gross: number;
    tax: number;
    pension: number;
  }>;
};

export type StatementAsset = {
  id: string;
  assetCode: string;
  assetType: string;
  purchaseDate: string | null;
  purchaseCost: number;
  annualDepreciation: number;
  status: string;
};

export type TaxStatementContext = {
  userId: string;
  period: TaxStatementPeriod;
  solopreneurRegistration: string | null;
  professionalService: boolean;
  pitDraft: PitDraftInputs | null;
  payerFeesIncludedInSales: boolean;
  employers: StatementEmployer[];
  sales: StatementSale[];
  expenses: StatementExpense[];
  payerTxs: StatementPayerTx[];
  receivables: StatementReceivable[];
  prepayments: StatementPrepaymentRec[];
  capitalAllowanceAvailable: number;
  inventoryCogs: {
    openingInventory: number;
    purchases: number;
    directAcquisitionCosts: number;
    closingInventory: number;
  } | null;
  orphanInventorySales: number;
  payrollTotal: number;
  employerPensionShare: number;
  assets: StatementAsset[];
  assetSales: Array<{
    assetId: string;
    saleDate: string;
    gainLossType: string;
    gainLossAmount: number;
    status: string;
  }>;
  assetDisposals: Array<{
    assetId: string;
    disposalDate: string;
    status: string;
  }>;
  loanInterest: number;
};

const SKIP_PAYER_PURPOSES = new Set([
  "loan_received",
  "owner_capital_introduced",
  "employee_director_repayment",
  "vendor_refund",
  "insurance_proceeds",
  "tax_refund",
  "asset_sale",
  "other_receipt",
]);

export function isSkipPayerPurpose(purpose: string): boolean {
  return SKIP_PAYER_PURPOSES.has(purpose.trim().toLowerCase());
}

export function catKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function saleRevenueAmount(sale: {
  amount: number;
  totalAmount?: number;
  vatAmount?: number;
}): number {
  if (sale.amount > 0) return naira(sale.amount);
  return naira(Math.max(0, (sale.totalAmount ?? 0) - (sale.vatAmount ?? 0)));
}

export function expenseAmount(row: {
  amount: number;
  totalAmount?: number;
}): number {
  if (row.amount > 0) return naira(row.amount);
  return naira(row.totalAmount ?? 0);
}

export function isSkippedOperatingExpense(
  category: string,
  expenseType: string,
): boolean {
  const keys = [catKey(category), catKey(expenseType)];
  return keys.some(
    (k) =>
      k === "fixed asset purchase" ||
      k === "loan repayment" ||
      k === "tax payment" ||
      k === "capital expense" ||
      k === "capex",
  );
}

export async function loadTaxStatementContext(
  userId: string,
  year: number,
): Promise<TaxStatementContext> {
  const period = statementPeriod(year);

  const [
    user,
    pitPayable,
    salesRows,
    expenseRows,
    payers,
    receivableRows,
    prepayments,
    booksCa,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { solopreneurRegistration: true },
    }),
    prisma.taxPayable.findUnique({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "PIT",
          periodYear: year,
          periodMonth: PIT_PERIOD_MONTH,
        },
      },
      select: { draftInputs: true },
    }),
    prisma.sale.findMany({ where: { userId } }),
    prisma.expense.findMany({ where: { userId } }),
    prisma.payer.findMany({
      where: { userId },
      include: { transactions: true },
    }),
    prisma.receivable.findMany({
      where: { userId, type: RECEIVABLE_TYPES.INVESTMENT_INCOME_OWED },
    }),
    prisma.prepayment.findMany({
      where: { userId },
      include: { schedule: true },
    }),
    capitalAllowanceService.getBooksAllowancesForYear(userId, year),
  ]);

  const pitDraft = (pitPayable?.draftInputs as PitDraftInputs | null) ?? null;
  const payerFeesIncludedInSales =
    typeof pitDraft?.payerFeesIncludedInSales === "boolean"
      ? pitDraft.payerFeesIncludedInSales
      : true;

  const employerList = await employersService.list(userId, { year });
  const employers: StatementEmployer[] = [];
  for (const emp of employerList.employers as Array<Record<string, unknown>>) {
    const id = String(emp.id);
    const history = await employersService.getIncomeHistory(userId, id, year);
    const entries = Array.isArray(history.entries) ? history.entries : [];
    employers.push({
      id,
      employerType: emp.employerType as EmployerType,
      relationship: emp.relationship as EmployerRelationship,
      startDate: String(emp.startDate),
      endDate: (emp.endDate as string | null) ?? null,
      paymentMethod: emp.paymentMethod as EmployerPaymentMethod,
      paymentFrequency: emp.paymentFrequency as EmployerPaymentFrequency,
      basicSalary: Number(emp.basicSalary ?? 0),
      housingAllowance: Number(emp.housingAllowance ?? 0),
      transportAllowance: Number(emp.transportAllowance ?? 0),
      otherAllowances: Number(emp.otherAllowances ?? 0),
      bonuses: Number(emp.bonuses ?? 0),
      commissions: Number(emp.commissions ?? 0),
      hasPension: Boolean(emp.hasPension),
      employeeRate: emp.employeeRate == null ? null : Number(emp.employeeRate),
      taxTreatment: emp.taxTreatment as EmployerTaxTreatment,
      payeCredit: Number(emp.payeCredit ?? 0),
      whtRate: Number(emp.whtRate ?? 0),
      historyEntries: entries.map((e: Record<string, unknown>) => ({
        gross: Number(e.gross ?? e.grossPay ?? e.amount ?? 0),
        tax: Number(e.taxDeducted ?? e.paye ?? e.sourceTax ?? e.tax ?? 0),
        pension: Number(
          e.pension ?? e.pensionDeducted ?? e.employeePension ?? 0,
        ),
      })),
    });
  }

  const sales: StatementSale[] = salesRows
    .filter((s) => !isUndoneStatus(s.status))
    .map((s) => ({
      category: s.category,
      amount: saleRevenueAmount({
        amount: d(s.amount),
        totalAmount: d(s.totalAmount),
        vatAmount: d(s.vatAmount),
      }),
      date: ymdFromDate(s.saleDate) ?? "",
    }))
    .filter((s) => inPeriod(s.date, period));

  const expenses: StatementExpense[] = expenseRows
    .filter((e) => !isUndoneStatus(e.status))
    .map((e) => ({
      category: e.category,
      expenseType: e.expenseType,
      amount: expenseAmount({
        amount: d(e.amount),
        totalAmount: d(e.totalAmount),
      }),
      date: ymdFromDate(e.expenseDate) ?? "",
    }))
    .filter((e) => inPeriod(e.date, period));

  const payerTxs: StatementPayerTx[] = [];
  for (const payer of payers) {
    if (payer.voided) continue;
    for (const tx of payer.transactions) {
      if (isUndoneStatus(tx.status)) continue;
      const date = ymdFromDate(tx.date);
      if (!inPeriod(date, period)) continue;
      if (isSkipPayerPurpose(tx.purpose)) continue;
      payerTxs.push({
        category: payer.category,
        purpose: tx.purpose,
        amount: naira(d(tx.amount)),
        date: date ?? "",
        status: tx.status,
        whtApplicable: payer.whtApplicable,
        whtRate: d(payer.whtRate) || 5,
      });
    }
  }

  const receivables: StatementReceivable[] = receivableRows.map((row) => {
    const payload = payloadObject(row.payload);
    return {
      incomeType: String(payload.incomeType ?? ""),
      incomeAmount: naira(d(row.grossAmount)),
      incomeAccrualDate: ymdFromDate(String(payload.incomeAccrualDate ?? "")),
      whtDeducted: naira(Number(payload.whtDeducted ?? 0)),
      status: row.status,
      recordStatus: row.recordStatus,
    };
  });

  const prepaymentRecs: StatementPrepaymentRec[] = [];
  for (const pre of prepayments) {
    for (const item of pre.schedule) {
      if (catKey(item.status) !== "recognized") continue;
      const date = ymdFromDate(item.recognitionDate);
      if (!inPeriod(date, period)) continue;
      prepaymentRecs.push({
        category: item.category || pre.category,
        amount: naira(d(item.amountAddedToExpense)),
        date: date ?? "",
      });
    }
  }

  let inventoryCogs: TaxStatementContext["inventoryCogs"] = null;
  if (year === lagosYear()) {
    const overview = await inventoryService.overview(userId, "year");
    const cogs = overview.cogs as {
      openingInventory?: number;
      purchases?: number;
      directAcquisitionCosts?: number;
      closingInventory?: number;
    };
    inventoryCogs = {
      openingInventory: naira(cogs.openingInventory ?? 0),
      purchases: naira(cogs.purchases ?? 0),
      directAcquisitionCosts: naira(cogs.directAcquisitionCosts ?? 0),
      closingInventory: naira(cogs.closingInventory ?? 0),
    };
  }

  const inventorySales = await prisma.inventorySale.findMany({
    where: { userId },
  });
  let orphanInventorySales = 0;
  for (const sale of inventorySales) {
    if (isUndoneStatus(sale.status)) continue;
    if (sale.linkedSaleId) continue;
    const date = ymdFromDate(sale.soldAt);
    if (!inPeriod(date, period)) continue;
    orphanInventorySales += naira(d(sale.totalAmount));
  }

  const [payrollTotal, employerPensionShare] = await loadPayrollYear(
    userId,
    year,
  );

  const assetRows = await prisma.asset.findMany({
    where: { userId, status: { notIn: ["voided", "reversed"] } },
  });
  const assets: StatementAsset[] = assetRows.map((a) => {
    const dep = computeAssetDepreciation({
      purchaseCost: d(a.purchaseCost),
      purchaseDate: a.purchaseDate,
      depreciationMethod: a.depreciationMethod,
      usefulLife: a.usefulLife,
      residualValue: a.residualValue != null ? d(a.residualValue) : null,
      depreciationRate:
        a.depreciationRate != null ? d(a.depreciationRate) : null,
      totalEstimatedUnit:
        a.totalEstimatedUnit != null ? d(a.totalEstimatedUnit) : null,
      unitProduced: a.unitProduced != null ? d(a.unitProduced) : null,
    });
    return {
      id: a.id,
      assetCode: a.assetCode,
      assetType: a.assetType,
      purchaseDate: ymdFromDate(a.purchaseDate),
      purchaseCost: naira(d(a.purchaseCost)),
      annualDepreciation: naira(dep.annualDepreciation),
      status: a.status,
    };
  });

  const [saleRows, disposalRows, repayments] = await Promise.all([
    prisma.assetSale.findMany({ where: { userId } }),
    prisma.assetDisposal.findMany({ where: { userId } }),
    prisma.liabilityRepayment.findMany({
      where: { userId, recordStatus: { not: "reversed" } },
    }),
  ]);

  const assetSales = saleRows.map((s) => ({
    assetId: s.assetId,
    saleDate: ymdFromDate(s.saleDate) ?? "",
    gainLossType: s.gainLossType,
    gainLossAmount: naira(d(s.gainLossAmount)),
    status: s.status,
  }));
  const assetDisposals = disposalRows.map((s) => ({
    assetId: s.assetId,
    disposalDate: ymdFromDate(s.disposalDate) ?? "",
    status: s.status,
  }));

  let loanInterest = 0;
  for (const r of repayments) {
    const date = ymdFromDate(r.paymentDate);
    if (!inPeriod(date, period)) continue;
    loanInterest += naira(d(r.interestAmount));
  }

  const business = await userService.getBusinessProfile(userId);

  return {
    userId,
    period,
    solopreneurRegistration: user?.solopreneurRegistration ?? null,
    professionalService: Boolean(business?.professionalService),
    pitDraft,
    payerFeesIncludedInSales,
    employers,
    sales,
    expenses,
    payerTxs,
    receivables,
    prepayments: prepaymentRecs,
    capitalAllowanceAvailable: naira(booksCa.available),
    inventoryCogs,
    orphanInventorySales,
    payrollTotal,
    employerPensionShare,
    assets,
    assetSales,
    assetDisposals,
    loanInterest,
  };
}

async function loadPayrollYear(
  userId: string,
  year: number,
): Promise<[number, number]> {
  const employees = await prisma.employee.findMany({ where: { userId } });
  const settings = await prisma.payrollSettings.findUnique({
    where: { userId },
  });
  const nhfApplicable = settings?.isNhfApplicable ?? true;
  let payrollTotal = 0;
  let pensionDue = 0;
  for (let month = 1; month <= 12; month += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    let monthGross = 0;
    let monthPension = 0;
    for (const e of employees) {
      if (!isEmployeeActiveInPayrollPeriod(e.startDate, key)) continue;
      const existing = await prisma.payrollPeriodSnapshot.findUnique({
        where: { employeeId_periodKey: { employeeId: e.id, periodKey: key } },
      });
      let gross = 0;
      let pensionEmployee = 0;
      let pensionEmployer = 0;
      if (existing) {
        gross = d(existing.gross);
        pensionEmployee = d(existing.pensionEmployee);
        pensionEmployer = d(existing.pensionEmployer);
      } else {
        const amounts = await resolveEmployeePeriodAmounts(
          userId,
          e.id,
          key,
          nhfApplicable,
          e.startDate,
        );
        if (!amounts) continue;
        gross = amounts.gross;
        pensionEmployee = amounts.pensionEmployee;
        pensionEmployer = amounts.pensionEmployer;
      }
      monthGross += gross;
      if (!isContractorEmployment(e.employmentType)) {
        monthPension += pensionEmployee + pensionEmployer;
      }
    }
    payrollTotal += naira(monthGross);
    const empPct = PENSION_EMPLOYEE_RATE;
    const erPct = PENSION_EMPLOYER_RATE;
    const due = naira(monthPension);
    if (empPct + erPct <= 0) continue;
    pensionDue += due - naira((due * empPct) / (empPct + erPct));
  }
  return [naira(payrollTotal), naira(pensionDue)];
}

export function liveReceivables(
  rows: StatementReceivable[],
  period: TaxStatementPeriod,
): StatementReceivable[] {
  return rows.filter((r) => {
    if (isUndoneStatus(r.status) || isUndoneStatus(r.recordStatus)) return false;
    return inPeriod(r.incomeAccrualDate, period);
  });
}

export function sumExpensesBy(
  expenses: StatementExpense[],
  match: (category: string) => boolean,
): number {
  return naira(
    expenses
      .filter((e) => !isSkippedOperatingExpense(e.category, e.expenseType))
      .filter((e) => match(catKey(e.category)))
      .reduce((s, e) => s + e.amount, 0),
  );
}

export function employeeRateOrDefault(emp: StatementEmployer): number {
  return emp.employeeRate ?? DEFAULT_EMPLOYEE_PENSION_RATE;
}
