import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  computeEmployeePayeMonthly,
  computeMonthlyTaxableEarnings,
  computeNhf,
  computePensionEmployee,
  computePensionEmployer,
  computePensionableMonthly,
} from "../../constants/payroll";
import { isContractorEmployment } from "../../constants/employmentTypes";
import {
  OBLIGATION_STATUS,
  OBLIGATION_TYPE,
  isEmployeeActiveInPayrollPeriod,
} from "../../constants/payrollObligations";
import {
  computeEmployerTaxComputation,
  computeEmployeePensionAnnual,
  computeMonthlyIncome,
  type EmployerProfileInput,
  type EmployerRemunerationInput,
} from "../../constants/employer";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import {
  compareMonthKeys,
  currentMonthKey,
  monthKeyFromDate,
  nextMonthKey,
} from "../../utils/lagosCalendar";

const CLOSED_PAYROLL_STATUSES = new Set([
  OBLIGATION_STATUS.PAID,
  "COMPLETED",
]);

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type EmployeeCompensationSnapshot = {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  mealAllowance: number;
  otherAllowances: number;
  stateOfResidence: string | null;
  employmentType: string;
  annualHouseRent: number;
  nhf: boolean;
  nhisHealthInsuranceMonthly: number;
  lifeAssurancePremiumMonthly: number;
  mortgageInterestMonthly: number;
};

export type PayrollSnapshotAmounts = {
  gross: number;
  paye: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  netPay: number;
};

const EMPLOYEE_TERMS_FIELDS = [
  "basicSalary",
  "housingAllowance",
  "transportAllowance",
  "mealAllowance",
  "otherAllowances",
  "stateOfResidence",
  "employmentType",
  "annualHouseRent",
  "nhf",
  "nhisHealthInsuranceMonthly",
  "lifeAssurancePremiumMonthly",
  "mortgageInterestMonthly",
  "startDate",
] as const;

const EMPLOYER_TERMS_FIELDS = [
  "employerType",
  "relationship",
  "paymentMethod",
  "paymentFrequency",
  "basicSalary",
  "housingAllowance",
  "transportAllowance",
  "otherAllowances",
  "bonuses",
  "commissions",
  "hasPension",
  "pensionStatus",
  "employeeRate",
  "employerRate",
  "endDate",
] as const;

function employeeTermsFromRow(row: {
  basicSalary: Decimal;
  housingAllowance: Decimal;
  transportAllowance: Decimal;
  mealAllowance: Decimal;
  otherAllowances: Decimal;
  stateOfResidence: string | null;
  employmentType: string;
  annualHouseRent: Decimal;
  nhf: boolean;
  nhisHealthInsuranceMonthly: Decimal;
  lifeAssurancePremiumMonthly: Decimal;
  mortgageInterestMonthly: Decimal;
}): EmployeeCompensationSnapshot {
  return {
    basicSalary: decimalToNumber(row.basicSalary),
    housingAllowance: decimalToNumber(row.housingAllowance),
    transportAllowance: decimalToNumber(row.transportAllowance),
    mealAllowance: decimalToNumber(row.mealAllowance),
    otherAllowances: decimalToNumber(row.otherAllowances),
    stateOfResidence: row.stateOfResidence,
    employmentType: row.employmentType,
    annualHouseRent: decimalToNumber(row.annualHouseRent),
    nhf: row.nhf,
    nhisHealthInsuranceMonthly: decimalToNumber(row.nhisHealthInsuranceMonthly),
    lifeAssurancePremiumMonthly: decimalToNumber(
      row.lifeAssurancePremiumMonthly,
    ),
    mortgageInterestMonthly: decimalToNumber(row.mortgageInterestMonthly),
  };
}

function employerRemunerationFromTerms(row: {
  paymentMethod: string;
  paymentFrequency: string;
  basicSalary: Decimal;
  housingAllowance: Decimal;
  transportAllowance: Decimal;
  otherAllowances: Decimal;
  bonuses: Decimal;
  commissions: Decimal;
  hasPension: boolean;
  employeeRate: Decimal | null;
}): EmployerRemunerationInput {
  return {
    paymentMethod: row.paymentMethod as EmployerRemunerationInput["paymentMethod"],
    paymentFrequency:
      row.paymentFrequency as EmployerRemunerationInput["paymentFrequency"],
    basicSalary: decimalToNumber(row.basicSalary),
    housingAllowance: decimalToNumber(row.housingAllowance),
    transportAllowance: decimalToNumber(row.transportAllowance),
    otherAllowances: decimalToNumber(row.otherAllowances),
    bonuses: decimalToNumber(row.bonuses),
    commissions: decimalToNumber(row.commissions),
    hasPension: row.hasPension,
    employeeRate: row.employeeRate != null ? decimalToNumber(row.employeeRate) : null,
  };
}

/** Current Lagos month; roll forward when the relevant period is already closed. */
export async function resolveEffectiveMonth(
  userId: string,
  context?: { employeeId?: string; employerId?: string },
): Promise<string> {
  let month = currentMonthKey();

  if (context?.employerId) {
    const row = await prisma.employerIncomeHistory.findUnique({
      where: {
        employerId_period: {
          employerId: context.employerId,
          period: month,
        },
      },
      select: { isProjection: true },
    });
    if (row && !row.isProjection) {
      month = nextMonthKey(month);
    }
    return month;
  }

  const payeRow = await prisma.payrollObligation.findUnique({
    where: {
      userId_type_period: {
        userId,
        type: OBLIGATION_TYPE.PAYE,
        period: month,
      },
    },
    select: { status: true },
  });
  if (payeRow && CLOSED_PAYROLL_STATUSES.has(payeRow.status)) {
    month = nextMonthKey(month);
  }

  return month;
}

export async function isPayrollPeriodClosed(
  userId: string,
  periodKey: string,
): Promise<boolean> {
  const payeRow = await prisma.payrollObligation.findUnique({
    where: {
      userId_type_period: {
        userId,
        type: OBLIGATION_TYPE.PAYE,
        period: periodKey,
      },
    },
    select: { status: true },
  });
  return Boolean(payeRow && CLOSED_PAYROLL_STATUSES.has(payeRow.status));
}

export function employeeTermsFieldsChanged(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): boolean {
  for (const field of EMPLOYEE_TERMS_FIELDS) {
    if (patch[field] === undefined) continue;
    if (field === "startDate") {
      const prev = existing.startDate instanceof Date
        ? existing.startDate.toISOString().slice(0, 10)
        : String(existing.startDate ?? "");
      const next = String(patch.startDate ?? "");
      if (prev !== next) return true;
      continue;
    }
    if (field === "stateOfResidence") {
      const prev = (existing.stateOfResidence as string | null)?.trim() || null;
      const next =
        patch.stateOfResidence === null || patch.stateOfResidence === undefined
          ? null
          : String(patch.stateOfResidence).trim() || null;
      if (prev !== next) return true;
      continue;
    }
    if (field === "nhf") {
      if (Boolean(existing.nhf) !== Boolean(patch.nhf)) return true;
      continue;
    }
    const prev = decimalToNumber(existing[field] as Decimal);
    const next = Number(patch[field]);
    if (prev !== next) return true;
  }
  return false;
}

export function employerTermsFieldsChanged(
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): boolean {
  for (const field of EMPLOYER_TERMS_FIELDS) {
    if (patch[field] === undefined) continue;
    if (field === "hasPension") {
      if (Boolean(existing.hasPension) !== Boolean(patch.hasPension)) return true;
      continue;
    }
    if (field === "endDate") {
      const prev = (existing.endDate as string | null) ?? null;
      const next =
        patch.endDate === undefined ? prev : (patch.endDate as string | null);
      if (prev !== next) return true;
      continue;
    }
    if (
      field === "pensionStatus" ||
      field === "employerType" ||
      field === "relationship" ||
      field === "paymentMethod" ||
      field === "paymentFrequency"
    ) {
      if (String(existing[field] ?? "") !== String(patch[field] ?? "")) {
        return true;
      }
      continue;
    }
    const prev =
      existing[field] == null ? null : decimalToNumber(existing[field] as Decimal);
    const next = patch[field] == null ? null : Number(patch[field]);
    if (prev !== next) return true;
  }
  return false;
}

export async function insertEmployeeTerms(
  employeeId: string,
  effectiveFrom: string,
  employee: {
    basicSalary: Decimal;
    housingAllowance: Decimal;
    transportAllowance: Decimal;
    mealAllowance: Decimal;
    otherAllowances: Decimal;
    stateOfResidence: string | null;
    employmentType: string;
    annualHouseRent: Decimal;
    nhf: boolean;
    nhisHealthInsuranceMonthly: Decimal;
    lifeAssurancePremiumMonthly: Decimal;
    mortgageInterestMonthly: Decimal;
  },
): Promise<void> {
  await prisma.employeeTerms.upsert({
    where: {
      employeeId_effectiveFrom: { employeeId, effectiveFrom },
    },
    create: {
      employeeId,
      effectiveFrom,
      basicSalary: employee.basicSalary,
      housingAllowance: employee.housingAllowance,
      transportAllowance: employee.transportAllowance,
      mealAllowance: employee.mealAllowance,
      otherAllowances: employee.otherAllowances,
      stateOfResidence: employee.stateOfResidence,
      employmentType: employee.employmentType,
      annualHouseRent: employee.annualHouseRent,
      nhf: employee.nhf,
      nhisHealthInsuranceMonthly: employee.nhisHealthInsuranceMonthly,
      lifeAssurancePremiumMonthly: employee.lifeAssurancePremiumMonthly,
      mortgageInterestMonthly: employee.mortgageInterestMonthly,
    },
    update: {
      basicSalary: employee.basicSalary,
      housingAllowance: employee.housingAllowance,
      transportAllowance: employee.transportAllowance,
      mealAllowance: employee.mealAllowance,
      otherAllowances: employee.otherAllowances,
      stateOfResidence: employee.stateOfResidence,
      employmentType: employee.employmentType,
      annualHouseRent: employee.annualHouseRent,
      nhf: employee.nhf,
      nhisHealthInsuranceMonthly: employee.nhisHealthInsuranceMonthly,
      lifeAssurancePremiumMonthly: employee.lifeAssurancePremiumMonthly,
      mortgageInterestMonthly: employee.mortgageInterestMonthly,
    },
  });
}

export async function insertEmployerTerms(
  employerId: string,
  effectiveFrom: string,
  employer: {
    employerType: string;
    relationship: string;
    paymentMethod: string;
    paymentFrequency: string;
    basicSalary: Decimal;
    housingAllowance: Decimal;
    transportAllowance: Decimal;
    otherAllowances: Decimal;
    bonuses: Decimal;
    commissions: Decimal;
    hasPension: boolean;
    pensionStatus: string | null;
    employeeRate: Decimal | null;
    employerRate: Decimal | null;
  },
): Promise<void> {
  await prisma.employerTerms.upsert({
    where: {
      employerId_effectiveFrom: { employerId, effectiveFrom },
    },
    create: {
      employerId,
      effectiveFrom,
      employerType: employer.employerType,
      relationship: employer.relationship,
      paymentMethod: employer.paymentMethod,
      paymentFrequency: employer.paymentFrequency,
      basicSalary: employer.basicSalary,
      housingAllowance: employer.housingAllowance,
      transportAllowance: employer.transportAllowance,
      otherAllowances: employer.otherAllowances,
      bonuses: employer.bonuses,
      commissions: employer.commissions,
      hasPension: employer.hasPension,
      pensionStatus: employer.pensionStatus,
      employeeRate: employer.employeeRate,
      employerRate: employer.employerRate,
    },
    update: {
      employerType: employer.employerType,
      relationship: employer.relationship,
      paymentMethod: employer.paymentMethod,
      paymentFrequency: employer.paymentFrequency,
      basicSalary: employer.basicSalary,
      housingAllowance: employer.housingAllowance,
      transportAllowance: employer.transportAllowance,
      otherAllowances: employer.otherAllowances,
      bonuses: employer.bonuses,
      commissions: employer.commissions,
      hasPension: employer.hasPension,
      pensionStatus: employer.pensionStatus,
      employeeRate: employer.employeeRate,
      employerRate: employer.employerRate,
    },
  });
}

export async function getEmployeeCompensationForPeriod(
  employeeId: string,
  periodKey: string,
): Promise<EmployeeCompensationSnapshot | null> {
  const terms = await prisma.employeeTerms.findFirst({
    where: {
      employeeId,
      effectiveFrom: { lte: periodKey },
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (terms) return employeeTermsFromRow(terms);

  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
  });
  if (!employee) return null;
  return employeeTermsFromRow(employee);
}

export function computeEmployeePeriodAmounts(
  compensation: EmployeeCompensationSnapshot,
  nhfApplicable: boolean,
): PayrollSnapshotAmounts {
  const contractor = isContractorEmployment(compensation.employmentType);
  const gross = computeMonthlyTaxableEarnings({
    basicMonthly: compensation.basicSalary,
    housingAllowanceMonthly: compensation.housingAllowance,
    transportAllowanceMonthly: compensation.transportAllowance,
    mealAllowanceMonthly: compensation.mealAllowance,
    otherTaxableAllowancesMonthly: compensation.otherAllowances,
  });
  if (contractor) {
    return {
      gross: round2(gross),
      paye: 0,
      pensionEmployee: 0,
      pensionEmployer: 0,
      nhf: 0,
      netPay: round2(gross),
    };
  }

  const pensionable = computePensionableMonthly({
    basicMonthly: compensation.basicSalary,
    housingAllowanceMonthly: compensation.housingAllowance,
    transportAllowanceMonthly: compensation.transportAllowance,
  });
  const pensionEmployee = computePensionEmployee(pensionable);
  const pensionEmployer = computePensionEmployer(pensionable);
  const paye = computeEmployeePayeMonthly(
    {
      basicSalary: compensation.basicSalary,
      housingAllowance: compensation.housingAllowance,
      transportAllowance: compensation.transportAllowance,
      mealAllowance: compensation.mealAllowance,
      otherAllowances: compensation.otherAllowances,
      annualHouseRent: compensation.annualHouseRent,
      nhisHealthInsuranceMonthly: compensation.nhisHealthInsuranceMonthly,
      lifeAssurancePremiumMonthly: compensation.lifeAssurancePremiumMonthly,
      mortgageInterestMonthly: compensation.mortgageInterestMonthly,
      nhf: compensation.nhf,
    },
    { nhfApplicable },
  );
  const nhf =
    nhfApplicable && compensation.nhf !== false
      ? computeNhf(compensation.basicSalary)
      : 0;
  const netPay = gross - pensionEmployee - nhf - paye;

  return {
    gross: round2(gross),
    paye: round2(paye),
    pensionEmployee: round2(pensionEmployee),
    pensionEmployer: round2(pensionEmployer),
    nhf: round2(nhf),
    netPay: round2(netPay),
  };
}

/** Persist immutable payroll figures for an employee period (no-op if already frozen). */
export async function freezePayrollSnapshot(
  userId: string,
  employeeId: string,
  periodKey: string,
  amounts: PayrollSnapshotAmounts,
): Promise<void> {
  const existing = await prisma.payrollPeriodSnapshot.findUnique({
    where: {
      employeeId_periodKey: { employeeId, periodKey },
    },
  });
  if (existing) return;

  await prisma.payrollPeriodSnapshot.create({
    data: {
      userId,
      employeeId,
      periodKey,
      gross: new Decimal(amounts.gross),
      paye: new Decimal(amounts.paye),
      pensionEmployee: new Decimal(amounts.pensionEmployee),
      pensionEmployer: new Decimal(amounts.pensionEmployer),
      nhf: new Decimal(amounts.nhf),
      netPay: new Decimal(amounts.netPay),
    },
  });
}

export async function invalidateOpenEmployeeSnapshotsFrom(
  userId: string,
  employeeId: string,
  effectiveFrom: string,
): Promise<void> {
  const closedRows = await prisma.payrollObligation.findMany({
    where: {
      userId,
      type: OBLIGATION_TYPE.PAYE,
      status: { in: [...CLOSED_PAYROLL_STATUSES] },
    },
    select: { period: true },
  });
  const closedPeriods = new Set(closedRows.map((r) => r.period));

  const snapshots = await prisma.payrollPeriodSnapshot.findMany({
    where: { userId, employeeId },
    select: { id: true, periodKey: true },
  });

  const toDelete = snapshots.filter(
    (s) =>
      compareMonthKeys(s.periodKey, effectiveFrom) >= 0 &&
      !closedPeriods.has(s.periodKey),
  );
  if (toDelete.length === 0) return;

  await prisma.payrollPeriodSnapshot.deleteMany({
    where: { id: { in: toDelete.map((s) => s.id) } },
  });
}

export async function resolveEmployeePeriodAmounts(
  userId: string,
  employeeId: string,
  periodKey: string,
  nhfApplicable: boolean,
  startDate: Date,
): Promise<PayrollSnapshotAmounts | null> {
  if (!isEmployeeActiveInPayrollPeriod(startDate, periodKey)) return null;

  const snapshot = await prisma.payrollPeriodSnapshot.findUnique({
    where: { employeeId_periodKey: { employeeId, periodKey } },
  });
  if (snapshot) {
    return {
      gross: decimalToNumber(snapshot.gross),
      paye: decimalToNumber(snapshot.paye),
      pensionEmployee: decimalToNumber(snapshot.pensionEmployee),
      pensionEmployer: decimalToNumber(snapshot.pensionEmployer),
      nhf: decimalToNumber(snapshot.nhf),
      netPay: decimalToNumber(snapshot.netPay),
    };
  }

  const compensation = await getEmployeeCompensationForPeriod(
    employeeId,
    periodKey,
  );
  if (!compensation) return null;

  const amounts = computeEmployeePeriodAmounts(compensation, nhfApplicable);
  await freezePayrollSnapshot(userId, employeeId, periodKey, amounts);
  return amounts;
}

export async function getEmployerTermsProfileForPeriod(
  employerId: string,
  periodKey: string,
) {
  const terms = await prisma.employerTerms.findFirst({
    where: {
      employerId,
      effectiveFrom: { lte: periodKey },
    },
    orderBy: { effectiveFrom: "desc" },
  });
  if (terms) return terms;

  return prisma.employer.findUnique({ where: { id: employerId } });
}

export async function computeEmployerIncomeEntry(
  employerId: string,
  periodKey: string,
  payeCredit = 0,
) {
  const employer = await getEmployerTermsProfileForPeriod(employerId, periodKey);
  if (!employer) return null;

  const profile: EmployerProfileInput = {
    employerType: employer.employerType as EmployerProfileInput["employerType"],
    relationship: employer.relationship as EmployerProfileInput["relationship"],
    endDate: "endDate" in employer ? employer.endDate : null,
    ...employerRemunerationFromTerms(employer),
  };

  const monthlyGross = computeMonthlyIncome(profile);
  const taxComputation = computeEmployerTaxComputation(profile, payeCredit);
  const monthlyTax = taxComputation.pitPayable / 12;
  const monthlyPension = profile.hasPension
    ? computeEmployeePensionAnnual(profile) / 12
    : 0;

  return {
    gross: normalizeMoneyAmount(monthlyGross),
    taxDeducted: normalizeMoneyAmount(Math.round(monthlyTax)),
    pension: normalizeMoneyAmount(Math.round(monthlyPension)),
    net: normalizeMoneyAmount(
      monthlyGross - Math.round(monthlyTax) - Math.round(monthlyPension),
    ),
    includesBonus: false,
  };
}

export async function materializeEmployerIncomeRow(
  employerId: string,
  periodKey: string,
  opts?: { asProjection?: boolean },
) {
  const existing = await prisma.employerIncomeHistory.findUnique({
    where: { employerId_period: { employerId, period: periodKey } },
  });
  if (existing && !existing.isProjection) return existing;

  const computed = await computeEmployerIncomeEntry(employerId, periodKey);
  if (!computed) return null;

  const asProjection =
    opts?.asProjection ?? periodKey >= currentMonthKey();

  if (existing?.isProjection) {
    return prisma.employerIncomeHistory.update({
      where: { id: existing.id },
      data: {
        gross: new Decimal(computed.gross),
        taxDeducted: new Decimal(computed.taxDeducted),
        pension: new Decimal(computed.pension),
        includesBonus: computed.includesBonus,
        isProjection: asProjection,
        frozenAt: asProjection ? null : new Date(),
      },
    });
  }

  return prisma.employerIncomeHistory.create({
    data: {
      employerId,
      period: periodKey,
      gross: new Decimal(computed.gross),
      taxDeducted: new Decimal(computed.taxDeducted),
      pension: new Decimal(computed.pension),
      includesBonus: computed.includesBonus,
      isProjection: asProjection,
      frozenAt: asProjection ? null : new Date(),
    },
  });
}

export async function invalidateOpenEmployerIncomeFrom(
  employerId: string,
  effectiveFrom: string,
): Promise<void> {
  const rows = await prisma.employerIncomeHistory.findMany({
    where: {
      employerId,
      isProjection: true,
      period: { gte: effectiveFrom },
    },
    select: { id: true },
  });
  if (rows.length === 0) return;
  await prisma.employerIncomeHistory.deleteMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });
}

export function employeeStartMonthKey(startDate: Date): string {
  return monthKeyFromDate(startDate);
}

export const prospectiveTermsService = {
  resolveEffectiveMonth,
  isPayrollPeriodClosed,
  employeeTermsFieldsChanged,
  employerTermsFieldsChanged,
  insertEmployeeTerms,
  insertEmployerTerms,
  getEmployeeCompensationForPeriod,
  computeEmployeePeriodAmounts,
  freezePayrollSnapshot,
  invalidateOpenEmployeeSnapshotsFrom,
  resolveEmployeePeriodAmounts,
  getEmployerTermsProfileForPeriod,
  computeEmployerIncomeEntry,
  materializeEmployerIncomeRow,
  invalidateOpenEmployerIncomeFrom,
  employeeStartMonthKey,
};
