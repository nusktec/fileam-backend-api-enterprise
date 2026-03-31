import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  computePayeMonthly,
  computePensionEmployee,
  computePensionEmployer,
  computeNhf,
  PAYE_DUE_DAY,
} from "../../constants/payroll";

const EMPLOYEE_COUNTER_ID = "employee_id";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function grossMonthly(e: {
  basicSalary: Decimal;
  housingAllowance: Decimal;
  transportAllowance: Decimal;
  mealAllowance: Decimal;
  otherAllowances: Decimal;
}): number {
  return (
    decimalToNumber(e.basicSalary) +
    decimalToNumber(e.housingAllowance) +
    decimalToNumber(e.transportAllowance) +
    decimalToNumber(e.mealAllowance) +
    decimalToNumber(e.otherAllowances)
  );
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

    const [employees, total, obligations] = await Promise.all([
      prisma.employee.findMany({
        where,
        orderBy: { createdAt: order },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.employee.count({ where }),
      this.getObligations(userId),
    ]);
    let monthlyPayroll = 0;
    const list = employees.map((e) => {
      const gross = grossMonthly(e);
      monthlyPayroll += gross;
      const pensionEmp = computePensionEmployee(gross);
      const nhf = computeNhf(decimalToNumber(e.basicSalary));
      const paye = computePayeMonthly(gross * 12);
      const net = gross - pensionEmp - nhf - paye;
      return {
        id: e.id,
        fullName: e.fullName,
        jobTitle: e.jobTitle,
        employmentType: e.employmentType,
        employeeId: e.employeeId,
        grossPay: gross,
        paye,
        netPay: net,
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
    const employees = await prisma.employee.findMany({ where: { userId } });
    let totalPaye = 0;
    let totalPension = 0;
    for (const e of employees) {
      const gross = grossMonthly(e);
      totalPaye += computePayeMonthly(gross * 12);
      totalPension +=
        computePensionEmployee(gross) + computePensionEmployer(gross);
    }
    const now = new Date();
    const dueDate = new Date(now.getFullYear(), now.getMonth(), PAYE_DUE_DAY);
    if (dueDate <= now) dueDate.setMonth(dueDate.getMonth() + 1);
    return {
      paye: {
        amount: totalPaye,
        status: "Pending",
        dueDate,
        note: "Due 10th of next month",
      },
      pension: {
        amount: totalPension,
        status: "Pending",
        note: "Employee (8%) + Employer (10%) contribution",
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
    const pensionEmp = computePensionEmployee(gross);
    const nhf = computeNhf(basic);
    const paye = computePayeMonthly(gross * 12);
    const pensionEmployer = computePensionEmployer(gross);
    const net = gross - pensionEmp - nhf - paye;
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
      salaryStructure: {
        basicSalary: basic,
        housingAllowance: decimalToNumber(e.housingAllowance),
        transportAllowance: decimalToNumber(e.transportAllowance),
        mealAllowance: decimalToNumber(e.mealAllowance),
        otherAllowances: decimalToNumber(e.otherAllowances),
        grossPay: gross,
      },
      deductions: {
        pensionEmployee: pensionEmp,
        nhf,
        paye,
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
      stateOfResidence?: string;
      startDate?: string;
      tin?: string;
      pensionRsa?: string;
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
        stateOfResidence: data.stateOfResidence ?? null,
        tin: data.tin ?? null,
        pensionRsa: data.pensionRsa ?? null,
        startDate,
      },
    });
    return this.getById(userId, employee.id);
  },

  async fileAsExpense(userId: string, employeeId: string, createdById?: string) {
    const employee = await prisma.employee.findFirst({
      where: { id: employeeId, userId },
    });
    if (!employee) return null;

    const gross = grossMonthly(employee);
    const pensionEmployer = computePensionEmployer(gross);
    const totalMonthlyCost = gross + pensionEmployer;

    const { expensesService } = await import("./expensesService");
    const dateStr = new Date().toISOString().split("T")[0];
    const description = `Salary: ${employee.fullName}${employee.jobTitle ? ` - ${employee.jobTitle}` : ""}`;

    return expensesService.create(userId, {
      amount: totalMonthlyCost,
      description,
      category: "Salary",
      date: dateStr,
      vatInclusive: false,
      createdById: createdById ?? userId,
      supplierName: employee.fullName,
      supplierId: employee.id,
    });
  },
};
