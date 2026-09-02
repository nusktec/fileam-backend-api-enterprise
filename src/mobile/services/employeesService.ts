import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  computeAnnualPayeReliefs,
  computeEmployeePayeMonthly,
  computeMonthlyTaxableEarnings,
  computeNhf,
  computePensionEmployee,
  computePensionEmployer,
  computePensionableMonthly,
  PAYE_DUE_DAY,
  type PayeReliefInputs,
} from "../../constants/payroll";
import {
  currentPayrollPeriodKey,
  isEmployeeActiveInPayrollPeriod,
} from "../../constants/payrollObligations";
import { isContractorEmployment } from "../../constants/employmentTypes";
import { PERCENT, WHT_RATE_SERVICES_PERCENT } from "../../constants/percentages";

const EMPLOYEE_COUNTER_ID = "employee_id";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

type EmployeeCompensation = {
  basicSalary: Decimal;
  housingAllowance: Decimal;
  transportAllowance: Decimal;
  mealAllowance: Decimal;
  otherAllowances: Decimal;
  otherTaxableIncome?: Decimal;
  employmentType: string;
  annualHouseRent?: Decimal;
  nhf?: boolean;
  nhisHealthInsurance?: Decimal;
  lifeAssurancePremium?: Decimal;
  mortgageInterest?: Decimal;
  otherAllowableDeductions?: Decimal;
};

function employeePayeRecord(e: EmployeeCompensation) {
  return {
    basicSalary: decimalToNumber(e.basicSalary),
    housingAllowance: decimalToNumber(e.housingAllowance),
    transportAllowance: decimalToNumber(e.transportAllowance),
    mealAllowance: decimalToNumber(e.mealAllowance),
    otherAllowances: decimalToNumber(e.otherAllowances),
    otherTaxableIncome: decimalToNumber(e.otherTaxableIncome),
    annualHouseRent: decimalToNumber(e.annualHouseRent),
    nhisHealthInsurance: decimalToNumber(e.nhisHealthInsurance),
    lifeAssurancePremium: decimalToNumber(e.lifeAssurancePremium),
    mortgageInterest: decimalToNumber(e.mortgageInterest),
    otherAllowableDeductions: decimalToNumber(e.otherAllowableDeductions),
    nhf: e.nhf,
  };
}

function grossMonthly(e: EmployeeCompensation): number {
  const row = employeePayeRecord(e);
  return computeMonthlyTaxableEarnings({
    basicMonthly: row.basicSalary,
    housingAllowanceMonthly: row.housingAllowance,
    transportAllowanceMonthly: row.transportAllowance,
    mealAllowanceMonthly: row.mealAllowance,
    otherTaxableAllowancesMonthly: row.otherAllowances,
    otherTaxableIncomeMonthly: row.otherTaxableIncome,
  });
}

export function payeReliefsFromEmployee(e: {
  annualHouseRent?: Decimal | number | null;
  nhisHealthInsurance?: Decimal | number | null;
  lifeAssurancePremium?: Decimal | number | null;
  mortgageInterest?: Decimal | number | null;
  otherAllowableDeductions?: Decimal | number | null;
}): PayeReliefInputs {
  return {
    annualHouseRent: decimalToNumber(e.annualHouseRent as Decimal),
    nhisHealthInsuranceMonthly: decimalToNumber(e.nhisHealthInsurance as Decimal),
    lifeAssurancePremium: decimalToNumber(e.lifeAssurancePremium as Decimal),
    mortgageInterest: decimalToNumber(e.mortgageInterest as Decimal),
    otherAllowableDeductions: decimalToNumber(
      e.otherAllowableDeductions as Decimal,
    ),
  };
}

/** Monthly gross pay (PDF taxable earnings) — analytics / expense totals. */
export function computeEmployeeMonthlyGrossPay(e: {
  basicSalary: Decimal;
  housingAllowance: Decimal;
  transportAllowance: Decimal;
  mealAllowance: Decimal;
  otherAllowances: Decimal;
  otherTaxableIncome?: Decimal;
}): number {
  return grossMonthly(e as EmployeeCompensation);
}

function employeeNhfContributor(e: { nhf?: boolean | null }): boolean {
  return e.nhf !== false;
}

function pensionableMonthly(e: EmployeeCompensation): number {
  return computePensionableMonthly({
    basicMonthly: decimalToNumber(e.basicSalary),
    housingAllowanceMonthly: decimalToNumber(e.housingAllowance),
    transportAllowanceMonthly: decimalToNumber(e.transportAllowance),
  });
}

function computePayeForEmployee(
  e: EmployeeCompensation,
  opts?: { nhfApplicable?: boolean },
): number {
  return computeEmployeePayeMonthly(employeePayeRecord(e), {
    nhfApplicable: opts?.nhfApplicable,
  });
}

/** Monthly net pay (gross − employee deductions / estimated contractor WHT). */
export function computeEmployeeMonthlyNetPay(
  e: EmployeeCompensation,
  opts?: { nhfApplicable?: boolean },
): number {
  const gross = computeEmployeeMonthlyGrossPay(e);
  const contractor = isContractorEmployment(e.employmentType);
  const pensionable = pensionableMonthly(e);
  const pensionEmp = contractor ? 0 : computePensionEmployee(pensionable);
  const businessNhf = opts?.nhfApplicable !== false;
  const nhf =
    contractor || !businessNhf || !employeeNhfContributor(e)
      ? 0
      : computeNhf(decimalToNumber(e.basicSalary));
  const paye = contractor ? 0 : computePayeForEmployee(e, opts);
  const whtEstimated = contractor
    ? (gross * WHT_RATE_SERVICES_PERCENT) / PERCENT
    : 0;
  return gross - pensionEmp - nhf - paye - whtEstimated;
}

async function isNhfApplicableForUser(userId: string): Promise<boolean> {
  const settings = await prisma.payrollSettings.findUnique({
    where: { userId },
    select: { isNhfApplicable: true },
  });
  return settings?.isNhfApplicable !== false;
}

function taxReliefPayload(e: {
  annualHouseRent: Decimal;
  nhf: boolean;
  nhisHealthInsurance: Decimal;
  lifeAssurancePremium: Decimal;
  mortgageInterest: Decimal;
  otherAllowableDeductions: Decimal;
}) {
  const inputs = payeReliefsFromEmployee(e);
  const computed = computeAnnualPayeReliefs(inputs);
  return {
    annualHouseRent: inputs.annualHouseRent ?? 0,
    nhf: e.nhf,
    nhisHealthInsuranceMonthly: inputs.nhisHealthInsuranceMonthly ?? 0,
    annualNhis: computed.annualNhis,
    lifeAssurancePremium: inputs.lifeAssurancePremium ?? 0,
    mortgageInterest: inputs.mortgageInterest ?? 0,
    otherAllowableDeductions: inputs.otherAllowableDeductions ?? 0,
    computedReliefs: {
      houseRentRelief: computed.houseRentRelief,
      annualNhis: computed.annualNhis,
      lifeAssurancePremium: computed.lifeAssurancePremium,
      mortgageInterest: computed.mortgageInterest,
      otherAllowableDeductions: computed.otherAllowableDeductions,
      totalAdditionalReliefs: computed.totalAdditionalReliefs,
    },
  };
}

/** Sum monthly PAYE across non-contractor employees active in the period (PDF strict). */
export async function computeTotalMonthlyPayeForUser(
  userId: string,
  periodKey: string = currentPayrollPeriodKey(),
): Promise<number> {
  const [employees, nhfApplicable] = await Promise.all([
    prisma.employee.findMany({ where: { userId } }),
    isNhfApplicableForUser(userId),
  ]);
  let total = 0;
  for (const e of employees) {
    if (isContractorEmployment(e.employmentType)) continue;
    if (!isEmployeeActiveInPayrollPeriod(e.startDate, periodKey)) continue;
    total += computePayeForEmployee(e, { nhfApplicable });
  }
  return total;
}

export const employeesService = {
  async list(
    userId: string,
    opts?: {
      page?: number;
      limit?: number;
      sortOrder?: "ASC" | "DESC";
      dateFrom?: Date;
      dateTo?: Date;
    },
  ) {
    const page = opts?.page ?? 1;
    const limit = Math.min(Math.max(1, opts?.limit ?? 10), 100);
    const order = opts?.sortOrder === "ASC" ? "asc" : "desc";
    const where: {
      userId: string;
      createdAt?: { gte?: Date; lte?: Date };
    } = { userId };
    if (opts?.dateFrom || opts?.dateTo) {
      where.createdAt = {};
      if (opts.dateFrom) where.createdAt.gte = opts.dateFrom;
      if (opts.dateTo) where.createdAt.lte = opts.dateTo;
    }

    const [employees, total, obligations, nhfApplicable] = await Promise.all([
      prisma.employee.findMany({
        where,
        orderBy: { createdAt: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.employee.count({ where }),
      this.getObligations(userId),
      isNhfApplicableForUser(userId),
    ]);
    let monthlyPayroll = 0;
    const list = employees.map((e) => {
      const gross = grossMonthly(e);
      monthlyPayroll += gross;
      const contractor = isContractorEmployment(e.employmentType);
      const paye = contractor ? 0 : computePayeForEmployee(e, { nhfApplicable });
      const whtEstimated = contractor
        ? (gross * WHT_RATE_SERVICES_PERCENT) / PERCENT
        : 0;
      return {
        id: e.id,
        fullName: e.fullName,
        jobTitle: e.jobTitle,
        employmentType: e.employmentType,
        employeeId: e.employeeId,
        pfa: e.pfa ?? null,
        nhf: e.nhf,
        grossPay: gross,
        paye,
        estimatedWhtMonthly: contractor ? whtEstimated : undefined,
        netPay: computeEmployeeMonthlyNetPay(e, { nhfApplicable }),
      };
    });
    return {
      totalEmployees: total,
      monthlyPayroll,
      obligations,
      employees: list,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async getObligations(userId: string) {
    const periodKey = currentPayrollPeriodKey();
    const totalPaye = await computeTotalMonthlyPayeForUser(userId, periodKey);
    const employees = await prisma.employee.findMany({ where: { userId } });
    let totalPension = 0;
    let totalContractorWht = 0;
    for (const e of employees) {
      if (!isEmployeeActiveInPayrollPeriod(e.startDate, periodKey)) continue;
      const gross = grossMonthly(e);
      if (isContractorEmployment(e.employmentType)) {
        totalContractorWht += (gross * WHT_RATE_SERVICES_PERCENT) / PERCENT;
        continue;
      }
      const pensionable = pensionableMonthly(e);
      totalPension +=
        computePensionEmployee(pensionable) +
        computePensionEmployer(pensionable);
    }
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), PAYE_DUE_DAY);
    if (dueDate <= now) dueDate.setMonth(dueDate.getMonth() + 1);
    return {
      paye: {
        amount: totalPaye,
        status: "Pending",
        dueDate,
        note: "Universal Nigeria PAYE 2026: AGI from salary components; pension on basic+housing+transport; NHF 2.5% of basic; NHIS monthly×12; rent relief min(20%×rent, ₦500k). Contractors excluded.",
      },
      contractorWht: {
        amount: totalContractorWht,
        status: "Pending",
        note: `Estimated WHT on professional fees at ${WHT_RATE_SERVICES_PERCENT}% of gross (Contract employment).`,
      },
      pension: {
        amount: totalPension,
        status: "Pending",
        note: "Employee (8%) + Employer (10%); contractors excluded from pension totals here.",
      },
    };
  },

  async getById(userId: string, employeeId: string) {
    const e = await prisma.employee.findFirst({
      where: { id: employeeId, userId },
    });
    if (!e) return null;
    const basic = decimalToNumber(e.basicSalary);
    const gross = grossMonthly(e);
    const contractor = isContractorEmployment(e.employmentType);
    const nhfApplicable = await isNhfApplicableForUser(userId);
    const pensionable = pensionableMonthly(e);
    const pensionEmp = contractor ? 0 : computePensionEmployee(pensionable);
    const nhf =
      contractor || !nhfApplicable || !employeeNhfContributor(e)
        ? 0
        : computeNhf(basic);
    const paye = contractor ? 0 : computePayeForEmployee(e, { nhfApplicable });
    const whtEstimated = contractor
      ? (gross * WHT_RATE_SERVICES_PERCENT) / PERCENT
      : 0;
    const pensionEmployer = contractor ? 0 : computePensionEmployer(pensionable);
    const net = computeEmployeeMonthlyNetPay(e, { nhfApplicable });
    const totalMonthlyCost = gross + pensionEmployer;
    return {
      id: e.id,
      fullName: e.fullName,
      jobTitle: e.jobTitle,
      employmentType: e.employmentType,
      employeeId: e.employeeId,
      startDate: e.startDate,
      stateOfResidence: e.stateOfResidence,
      tin: e.tin,
      pensionRsa: e.pensionRsa,
      pfa: e.pfa ?? null,
      taxRelief: taxReliefPayload(e),
      salaryStructure: {
        basicSalary: basic,
        housingAllowance: decimalToNumber(e.housingAllowance),
        transportAllowance: decimalToNumber(e.transportAllowance),
        mealAllowance: decimalToNumber(e.mealAllowance),
        otherAllowances: decimalToNumber(e.otherAllowances),
        otherTaxableIncome: decimalToNumber(e.otherTaxableIncome),
        grossPay: gross,
      },
      deductions: {
        pensionEmployee: pensionEmp,
        nhf,
        paye,
        estimatedWhtMonthly: contractor ? whtEstimated : undefined,
        netPay: net,
      },
      employerObligations: {
        pensionEmployer,
        totalMonthlyCost,
      },
    };
  },

  async create(
    userId: string,
    data: {
      fullName: string;
      jobTitle: string;
      employmentType: string;
      basicSalary: number;
      housingAllowance?: number;
      transportAllowance?: number;
      mealAllowance?: number;
      otherAllowances?: number;
      otherTaxableIncome?: number;
      stateOfResidence?: string;
      startDate?: string;
      tin?: string;
      pensionRsa?: string;
      pfa?: string;
      annualHouseRent?: number;
      nhf?: boolean;
      nhisHealthInsurance?: number;
      lifeAssurancePremium?: number;
      mortgageInterest?: number;
      otherAllowableDeductions?: number;
    },
  ) {
    const counter = await prisma.counter.upsert({
      where: { id: EMPLOYEE_COUNTER_ID },
      create: { id: EMPLOYEE_COUNTER_ID, lastNumber: 1 },
      update: { lastNumber: { increment: 1 } },
    });
    const employeeId = `TH${String(counter.lastNumber).padStart(3, "0")}`;
    const startDate = data.startDate ? new Date(data.startDate) : new Date();
    const employee = await prisma.employee.create({
      data: {
        userId,
        employeeId,
        fullName: data.fullName,
        jobTitle: data.jobTitle,
        employmentType: data.employmentType,
        basicSalary: new Decimal(data.basicSalary),
        housingAllowance: new Decimal(data.housingAllowance ?? 0),
        transportAllowance: new Decimal(data.transportAllowance ?? 0),
        mealAllowance: new Decimal(data.mealAllowance ?? 0),
        otherAllowances: new Decimal(data.otherAllowances ?? 0),
        otherTaxableIncome: new Decimal(data.otherTaxableIncome ?? 0),
        stateOfResidence: data.stateOfResidence ?? null,
        tin: data.tin ?? null,
        pensionRsa: data.pensionRsa ?? null,
        pfa: data.pfa?.trim() || null,
        annualHouseRent: new Decimal(data.annualHouseRent ?? 0),
        nhf: data.nhf !== false,
        nhisHealthInsurance: new Decimal(data.nhisHealthInsurance ?? 0),
        lifeAssurancePremium: new Decimal(data.lifeAssurancePremium ?? 0),
        mortgageInterest: new Decimal(data.mortgageInterest ?? 0),
        otherAllowableDeductions: new Decimal(data.otherAllowableDeductions ?? 0),
        startDate,
      },
    });
    return this.getById(userId, employee.id);
  },

  async update(
    userId: string,
    employeeId: string,
    data: Partial<{
      fullName: string;
      jobTitle: string;
      employmentType: string;
      basicSalary: number;
      housingAllowance: number;
      transportAllowance: number;
      mealAllowance: number;
      otherAllowances: number;
      otherTaxableIncome: number;
      stateOfResidence: string | null;
      startDate: string;
      tin: string | null;
      pensionRsa: string | null;
      pfa: string | null;
      annualHouseRent: number;
      nhf: boolean;
      nhisHealthInsurance: number;
      lifeAssurancePremium: number;
      mortgageInterest: number;
      otherAllowableDeductions: number;
    }>,
  ) {
    const existing = await prisma.employee.findFirst({
      where: { id: employeeId, userId },
    });
    if (!existing) return null;

    const updateData: Record<string, unknown> = {};
    if (data.fullName != null) updateData.fullName = data.fullName.trim();
    if (data.jobTitle != null) updateData.jobTitle = data.jobTitle.trim();
    if (data.employmentType != null)
      updateData.employmentType = data.employmentType;
    if (data.basicSalary != null)
      updateData.basicSalary = new Decimal(data.basicSalary);
    if (data.housingAllowance != null)
      updateData.housingAllowance = new Decimal(data.housingAllowance);
    if (data.transportAllowance != null)
      updateData.transportAllowance = new Decimal(data.transportAllowance);
    if (data.mealAllowance != null)
      updateData.mealAllowance = new Decimal(data.mealAllowance);
    if (data.otherAllowances != null)
      updateData.otherAllowances = new Decimal(data.otherAllowances);
    if (data.otherTaxableIncome != null)
      updateData.otherTaxableIncome = new Decimal(data.otherTaxableIncome);
    if (data.stateOfResidence !== undefined) {
      updateData.stateOfResidence = data.stateOfResidence?.trim() || null;
    }
    if (data.startDate != null) updateData.startDate = new Date(data.startDate);
    if (data.tin !== undefined) updateData.tin = data.tin?.trim() || null;
    if (data.pensionRsa !== undefined) {
      updateData.pensionRsa = data.pensionRsa?.trim() || null;
    }
    if (data.pfa !== undefined) {
      updateData.pfa = data.pfa?.trim() || null;
    }
    if (data.annualHouseRent != null) {
      updateData.annualHouseRent = new Decimal(data.annualHouseRent);
    }
    if (data.nhf !== undefined) updateData.nhf = Boolean(data.nhf);
    if (data.nhisHealthInsurance != null) {
      updateData.nhisHealthInsurance = new Decimal(data.nhisHealthInsurance);
    }
    if (data.lifeAssurancePremium != null) {
      updateData.lifeAssurancePremium = new Decimal(data.lifeAssurancePremium);
    }
    if (data.mortgageInterest != null) {
      updateData.mortgageInterest = new Decimal(data.mortgageInterest);
    }
    if (data.otherAllowableDeductions != null) {
      updateData.otherAllowableDeductions = new Decimal(
        data.otherAllowableDeductions,
      );
    }

    if (Object.keys(updateData).length === 0) {
      return this.getById(userId, employeeId);
    }

    await prisma.employee.update({
      where: { id: employeeId },
      data: updateData,
    });
    return this.getById(userId, employeeId);
  },

  async deleteForUser(userId: string, employeeId: string): Promise<boolean> {
    const result = await prisma.employee.deleteMany({
      where: { id: employeeId, userId },
    });
    return result.count > 0;
  },

  async fileAsExpense(userId: string, employeeId: string, createdById?: string) {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, userId },
    });
    if (!employee) return null;

    const gross = grossMonthly(employee);
    const pensionable = pensionableMonthly(employee);
    const pensionEmployer = computePensionEmployer(pensionable);
    const totalMonthlyCost = gross + pensionEmployer;

    const { expensesService } = await import("./expensesService");
    const dateStr = new Date().toISOString().split("T")[0];
    const description = `Salary: ${employee.fullName}${employee.jobTitle ? ` - ${employee.jobTitle}` : ""}`;

    return expensesService.create(userId, {
      amount: totalMonthlyCost,
      description,
      category: "Salary",
      expenseType: "OPEX",
      date: dateStr,
      vatInclusive: false,
      createdById: createdById ?? userId,
      supplierName: employee.fullName,
      supplierId: employee.id,
    });
  },
};
