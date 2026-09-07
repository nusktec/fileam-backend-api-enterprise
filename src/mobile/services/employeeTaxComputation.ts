import {
  computePensionableMonthly,
  computePensionEmployee,
  computeNhf,
} from "../../constants/payroll";

/** NTA 2025 s.58 minimum wage exemption threshold (monthly). */
const MINIMUM_WAGE_MONTHLY_NGN = 70_000;

export function computeEmployeeTaxComputation(e: {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  mealAllowance: number;
  otherAllowances: number;
  nhf?: boolean;
  nhfApplicable?: boolean;
  taxRelief?: {
    computedReliefs?: { totalAdditionalReliefs?: number };
  };
  deductions?: { pensionEmployee?: number; nhf?: number; paye?: number };
}) {
  const monthlyGross =
    e.basicSalary +
    e.housingAllowance +
    e.transportAllowance +
    e.mealAllowance +
    e.otherAllowances;
  const annualGross = monthlyGross * 12;
  const pensionableEmoluments =
    (e.basicSalary + e.housingAllowance + e.transportAllowance) * 12;
  const pensionEmployee =
    e.deductions?.pensionEmployee ??
    computePensionEmployee(
      computePensionableMonthly({
        basicMonthly: e.basicSalary,
        housingAllowanceMonthly: e.housingAllowance,
        transportAllowanceMonthly: e.transportAllowance,
      }),
    );
  const annualPension = pensionEmployee * 12;
  const monthlyNhf =
    e.deductions?.nhf ??
    (e.nhf !== false && e.nhfApplicable !== false
      ? computeNhf(e.basicSalary)
      : 0);
  const annualNhf = monthlyNhf * 12;
  const monthlyPaye = e.deductions?.paye ?? 0;
  const annualPaye = monthlyPaye * 12;
  const totalAdditionalReliefs =
    e.taxRelief?.computedReliefs?.totalAdditionalReliefs ?? 0;
  const minimumWageExempt =
    monthlyGross > 0 && monthlyGross <= MINIMUM_WAGE_MONTHLY_NGN;
  const chargeableIncome = minimumWageExempt
    ? 0
    : Math.max(
        0,
        annualGross - annualPension - annualNhf - totalAdditionalReliefs,
      );
  const effectiveTaxRate =
    annualGross > 0 ? (annualPaye / annualGross) * 100 : 0;
  return {
    chargeableIncome: Math.round(chargeableIncome),
    pensionableEmoluments: Math.round(pensionableEmoluments),
    effectiveTaxRate: Math.round(effectiveTaxRate * 100) / 100,
  };
}
