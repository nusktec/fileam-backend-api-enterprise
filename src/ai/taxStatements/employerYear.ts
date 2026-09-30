import { NATIONAL_MINIMUM_WAGE_MONTHLY_NGN } from "../../constants/employer";
import { naira } from "./taxStatementMath";
import { inPeriod } from "./taxStatementPeriod";
import type { TaxStatementPeriod } from "./taxStatementTypes";
import {
  employeeRateOrDefault,
  type StatementEmployer,
} from "./taxStatementSources";

const FREQUENCY_MULTIPLIER: Record<string, number> = {
  WEEKLY: 52,
  FORTNIGHTLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUALLY: 1,
  ONE_OFF: 1,
};

export type EmployerYearResult = {
  employer: StatementEmployer;
  hasHistory: boolean;
  gross: number;
  tax: number;
  pension: number;
  activeMonths: number;
  oneOff: boolean;
  included: boolean;
};

export function isOneOffEmployer(emp: StatementEmployer): boolean {
  return emp.paymentMethod === "ONE_OFF" || emp.paymentFrequency === "ONE_OFF";
}

export function periodGross(emp: StatementEmployer): number {
  return (
    emp.basicSalary +
    emp.housingAllowance +
    emp.transportAllowance +
    emp.otherAllowances +
    emp.bonuses +
    emp.commissions
  );
}

export function pensionablePeriod(emp: StatementEmployer): number {
  return emp.basicSalary + emp.housingAllowance + emp.transportAllowance;
}

export function lastDayOfMonth(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

export function firstDayOfMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

export function activeMonthsInPeriod(
  emp: StatementEmployer,
  period: TaxStatementPeriod,
): number {
  const year = period.year;
  let count = 0;
  for (let month = 1; month <= 12; month += 1) {
    const start = firstDayOfMonth(year, month);
    const end = lastDayOfMonth(year, month);
    if (emp.startDate > end) continue;
    if (emp.endDate && emp.endDate < start) continue;
    count += 1;
  }
  return count;
}

export function overlapsPeriod(
  emp: StatementEmployer,
  period: TaxStatementPeriod,
): boolean {
  if (emp.startDate > period.periodEnd) return false;
  if (emp.endDate && emp.endDate < period.periodStart) return false;
  return true;
}

export function employerYearAmount(
  emp: StatementEmployer,
  period: TaxStatementPeriod,
): EmployerYearResult {
  const oneOff = isOneOffEmployer(emp);
  const hasHistory = emp.historyEntries.length > 0;
  if (hasHistory) {
    const gross = naira(emp.historyEntries.reduce((s, e) => s + e.gross, 0));
    const tax = naira(emp.historyEntries.reduce((s, e) => s + e.tax, 0));
    const pension = naira(emp.historyEntries.reduce((s, e) => s + e.pension, 0));
    return {
      employer: emp,
      hasHistory: true,
      gross,
      tax,
      pension,
      activeMonths: activeMonthsInPeriod(emp, period),
      oneOff,
      included: true,
    };
  }

  if (!overlapsPeriod(emp, period)) {
    return {
      employer: emp,
      hasHistory: false,
      gross: 0,
      tax: 0,
      pension: 0,
      activeMonths: 0,
      oneOff,
      included: false,
    };
  }

  if (oneOff) {
    const included = inPeriod(emp.startDate, period);
    const gross = included ? naira(periodGross(emp)) : 0;
    return {
      employer: emp,
      hasHistory: false,
      gross,
      tax: 0,
      pension: included ? noHistoryPension(emp, period, 1, true) : 0,
      activeMonths: included ? 1 : 0,
      oneOff: true,
      included,
    };
  }

  const activeMonths = activeMonthsInPeriod(emp, period);
  const multiplier =
    FREQUENCY_MULTIPLIER[emp.paymentFrequency] ?? FREQUENCY_MULTIPLIER.MONTHLY;
  const scale = (activeMonths * multiplier) / 12;
  const gross = naira(periodGross(emp) * scale);
  return {
    employer: emp,
    hasHistory: false,
    gross,
    tax: 0,
    pension: noHistoryPension(emp, period, activeMonths, false),
    activeMonths,
    oneOff: false,
    included: true,
  };
}

function noHistoryPension(
  emp: StatementEmployer,
  period: TaxStatementPeriod,
  activeMonths: number,
  oneOff: boolean,
): number {
  if (!emp.hasPension) return 0;
  const multiplier =
    FREQUENCY_MULTIPLIER[emp.paymentFrequency] ?? FREQUENCY_MULTIPLIER.MONTHLY;
  const pensionable = oneOff
    ? pensionablePeriod(emp)
    : naira((pensionablePeriod(emp) * multiplier * activeMonths) / 12);
  return naira((pensionable * employeeRateOrDefault(emp)) / 100);
}

export function componentYearAmount(
  component: number,
  emp: StatementEmployer,
  period: TaxStatementPeriod,
  included: EmployerYearResult,
): number {
  if (included.hasHistory) return 0;
  if (!included.included) return 0;
  if (included.oneOff) return naira(component);
  const multiplier =
    FREQUENCY_MULTIPLIER[emp.paymentFrequency] ?? FREQUENCY_MULTIPLIER.MONTHLY;
  return naira((component * multiplier * included.activeMonths) / 12);
}

export function employerWhtCredit(year: EmployerYearResult): number {
  const emp = year.employer;
  if (emp.taxTreatment !== "WHT" || !year.included) return 0;
  if (year.hasHistory) return naira(year.tax);
  const rate = emp.whtRate || 5;
  return naira((year.gross * rate) / 100);
}

export function employerPayeCredit(year: EmployerYearResult): number {
  const emp = year.employer;
  if (emp.taxTreatment !== "PAYE" || !year.included) return 0;
  if (year.hasHistory) return naira(year.tax);
  if (year.activeMonths === 12) return naira(emp.payeCredit);
  return 0;
}

export function isMinWageEmploymentGross(gross: number): boolean {
  return gross / 12 <= NATIONAL_MINIMUM_WAGE_MONTHLY_NGN;
}

export function payerWhtCredit(amount: number, rate: number): number {
  return naira((amount * (rate || 5)) / 100);
}
