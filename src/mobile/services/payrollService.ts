import { Decimal } from "@prisma/client/runtime/library";
import PDFDocument from "pdfkit";
import { prisma } from "../../config/database";
import {
  computeEmployeePayeMonthly,
  computeMonthlyTaxableEarnings,
  computeNhf,
  computePensionEmployee,
  computePensionEmployer,
  computePensionableMonthly,
  NHF_RATE,
  PAYE_DUE_DAY,
  PENSION_EMPLOYEE_RATE,
  PENSION_EMPLOYER_RATE,
} from "../../constants/payroll";
import {
  NHF_COLLECTING_AUTHORITY,
  NHF_LEGAL_BASIS,
  OBLIGATION_STATUS,
  OBLIGATION_TYPE,
  PAYE_COLLECTING_AUTHORITY_DEFAULT,
  PENSION_REGULATORY_BASIS,
  PERIOD_REGEX,
  REMITTANCE_METHOD_DEFAULT,
  isEmployeeActiveInPayrollPeriod,
  type ObligationType,
} from "../../constants/payrollObligations";
import { isContractorEmployment } from "../../constants/employmentTypes";
import { HttpReplyError } from "../../utils/httpReplyError";
import { ledgerPostingService } from "../../services/ledgerPostingService";
import { computeEmployeeMonthlyNetPay } from "./employeesService";

const PAYMENT_BASE_URL =
  process.env.PAYMENT_BASE_URL || "https://pay.fileam.app";

function decimalToNumber(d: Decimal | null | undefined): number {
  if (d == null) return 0;
  return Number(d);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parsePeriod(period?: string): { year: number; month: number; key: string } {
  const now = new Date();
  const key =
    period && PERIOD_REGEX.test(period)
      ? period
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (!PERIOD_REGEX.test(key)) {
    throw new HttpReplyError(400, "period must be YYYY-MM");
  }
  const [y, m] = key.split("-").map(Number);
  return { year: y!, month: m!, key };
}

/** Remittance due date: 10th of the month after the payroll period. */
function dueDateForPeriod(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(Date.UTC(nextYear, nextMonth - 1, PAYE_DUE_DAY));
}

function daysRemainingUntil(due: Date): number {
  const today = new Date();
  const start = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const end = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.max(0, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
}

function formatDateYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function grossMonthly(e: {
  basicSalary: Decimal;
  housingAllowance: Decimal;
  transportAllowance: Decimal;
  mealAllowance: Decimal;
  otherAllowances: Decimal;
  otherTaxableIncome?: Decimal;
}): number {
  return computeMonthlyTaxableEarnings({
    basicMonthly: decimalToNumber(e.basicSalary),
    housingAllowanceMonthly: decimalToNumber(e.housingAllowance),
    transportAllowanceMonthly: decimalToNumber(e.transportAllowance),
    mealAllowanceMonthly: decimalToNumber(e.mealAllowance),
    otherTaxableAllowancesMonthly: decimalToNumber(e.otherAllowances),
    otherTaxableIncomeMonthly: decimalToNumber(e.otherTaxableIncome),
  });
}

type EmpRow = Awaited<ReturnType<typeof prisma.employee.findMany>>[number];

function taxableMonthly(gross: number, paye: number, pensionEmp: number): number {
  return round2(Math.max(0, gross - pensionEmp));
}

async function getOrCreateSettings(userId: string) {
  return prisma.payrollSettings.upsert({
    where: { userId },
    create: { userId, isNhfApplicable: true },
    update: {},
  });
}

async function resolvePayeAuthority(userId: string): Promise<string> {
  const [user, business] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { state: true },
    }),
    prisma.business.findFirst({
      where: { userId },
      select: { stateOfResidence: true },
    }),
  ]);
  const state = business?.stateOfResidence || user?.state;
  if (state && String(state).trim()) {
    return `${String(state).trim()} Internal Revenue Service`;
  }
  return PAYE_COLLECTING_AUTHORITY_DEFAULT;
}

function computePeriodTotals(
  employees: EmpRow[],
  nhfApplicable: boolean,
  periodKey: string,
) {
  let totalPayroll = 0;
  let netPayout = 0;
  let totalPaye = 0;
  let totalNhf = 0;
  let totalPension = 0;
  let applicableNhfCount = 0;
  let activeEmployeeCount = 0;
  const pfas = new Set<string>();

  const payeLines: Array<{
    name: string;
    id: string;
    payee: number;
    gross: number;
    taxable: number;
  }> = [];
  const nhfLines: Array<{
    name: string;
    id: string;
    nhf: number;
    basicSalary: number;
  }> = [];
  const pensionLines: Array<{
    name: string;
    total: number;
    employeePercent: number;
    employerPercent: number;
    pfa: string | null;
  }> = [];

  for (const e of employees) {
    if (!isEmployeeActiveInPayrollPeriod(e.startDate, periodKey)) continue;
    activeEmployeeCount += 1;

    const gross = grossMonthly(e);
    totalPayroll += gross;
    const contractor = isContractorEmployment(e.employmentType);
    const net = computeEmployeeMonthlyNetPay(e, { nhfApplicable });
    netPayout += net;

    if (contractor) continue;

    const pensionable = computePensionableMonthly({
      basicMonthly: decimalToNumber(e.basicSalary),
      housingAllowanceMonthly: decimalToNumber(e.housingAllowance),
      transportAllowanceMonthly: decimalToNumber(e.transportAllowance),
    });
    const pensionEmp = computePensionEmployee(pensionable);
    const pensionEr = computePensionEmployer(pensionable);
    const paye = computeEmployeePayeMonthly(
      {
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
      },
      { nhfApplicable },
    );
    const employeeNhf = e.nhf !== false;
    const nhf =
      nhfApplicable && employeeNhf
        ? computeNhf(decimalToNumber(e.basicSalary))
        : 0;

    totalPaye += paye;
    totalNhf += nhf;
    totalPension += pensionEmp + pensionEr;
    if (nhfApplicable && employeeNhf) applicableNhfCount += 1;
    if (e.pfa?.trim()) pfas.add(e.pfa.trim());

    payeLines.push({
      name: e.fullName,
      id: e.employeeId,
      payee: round2(paye),
      gross: round2(gross),
      taxable: taxableMonthly(gross, paye, pensionEmp),
    });
    if (nhfApplicable && employeeNhf) {
      nhfLines.push({
        name: e.fullName,
        id: e.employeeId,
        nhf: round2(nhf),
        basicSalary: round2(decimalToNumber(e.basicSalary)),
      });
    }
    pensionLines.push({
      name: e.fullName,
      total: round2(pensionEmp + pensionEr),
      employeePercent: PENSION_EMPLOYEE_RATE,
      employerPercent: PENSION_EMPLOYER_RATE,
      pfa: e.pfa ?? null,
    });
  }

  return {
    totalPayroll: round2(totalPayroll),
    netPayout: round2(netPayout),
    totalDeduction: round2(totalPayroll - netPayout),
    totalPaye: round2(totalPaye),
    totalNhf: round2(totalNhf),
    totalPension: round2(totalPension),
    applicableNhfCount,
    activeEmployeeCount,
    totalNoOfPfas: pfas.size,
    primaryPfa: [...pfas][0] ?? "Pension Fund Administrators",
    payeLines,
    nhfLines,
    pensionLines,
  };
}

async function getObligationRow(
  userId: string,
  type: ObligationType,
  period: string,
) {
  return prisma.payrollObligation.findUnique({
    where: {
      userId_type_period: { userId, type, period },
    },
  });
}

async function upsertObligationSnapshot(
  userId: string,
  type: ObligationType,
  period: string,
  amount: number,
  dueDate: Date,
  collectingAuthority: string,
) {
  const existing = await getObligationRow(userId, type, period);
  if (existing) {
    if (existing.status === OBLIGATION_STATUS.PAID) return existing;
    return prisma.payrollObligation.update({
      where: { id: existing.id },
      data: {
        amount: new Decimal(amount),
        dueDate,
        collectingAuthority,
      },
    });
  }
  return prisma.payrollObligation.create({
    data: {
      userId,
      type,
      period,
      amount: new Decimal(amount),
      status: OBLIGATION_STATUS.PENDING,
      dueDate,
      collectingAuthority,
    },
  });
}

async function historyForType(userId: string, type: ObligationType) {
  const rows = await prisma.payrollObligation.findMany({
    where: { userId, type, status: OBLIGATION_STATUS.PAID },
    orderBy: { period: "desc" },
    take: 24,
  });
  return rows.map((r) => ({
    period: r.period,
    status: r.status,
    datePaid: r.paidAt ? r.paidAt.toISOString().slice(0, 10) : null,
    paidDate: r.paidAt ? r.paidAt.toISOString().slice(0, 10) : null,
    evidence: r.evidenceUrls,
  }));
}

export const payrollService = {
  async getSummary(userId: string, periodQuery?: string) {
    const { year, month, key } = parsePeriod(periodQuery);
    const due = dueDateForPeriod(year, month);
    const daysLeft = daysRemainingUntil(due);
    const dueStr = formatDateYmd(due);

    const [employees, settings] = await Promise.all([
      prisma.employee.findMany({ where: { userId } }),
      getOrCreateSettings(userId),
    ]);
    const totals = computePeriodTotals(employees, settings.isNhfApplicable, key);
    const payeAuth = await resolvePayeAuthority(userId);

    const [payeRow, nhfRow, pensionRow] = await Promise.all([
      upsertObligationSnapshot(
        userId,
        OBLIGATION_TYPE.PAYE,
        key,
        totals.totalPaye,
        due,
        payeAuth,
      ),
      settings.isNhfApplicable
        ? upsertObligationSnapshot(
            userId,
            OBLIGATION_TYPE.NHF,
            key,
            totals.totalNhf,
            due,
            NHF_COLLECTING_AUTHORITY,
          )
        : null,
      upsertObligationSnapshot(
        userId,
        OBLIGATION_TYPE.PENSION,
        key,
        totals.totalPension,
        due,
        totals.primaryPfa,
      ),
    ]);

    const statutoryObligations = [
      {
        type: OBLIGATION_TYPE.PAYE,
        daysRemaining: daysLeft,
        amount: totals.totalPaye,
        status: payeRow.status,
        dueDate: dueStr,
        collectingAuthority: payeAuth,
      },
      ...(settings.isNhfApplicable && nhfRow
        ? [
            {
              type: OBLIGATION_TYPE.NHF,
              daysRemaining: daysLeft,
              amount: totals.totalNhf,
              status: nhfRow.status,
              dueDate: dueStr,
              collectingAuthority: NHF_COLLECTING_AUTHORITY,
            },
          ]
        : []),
      {
        type: OBLIGATION_TYPE.PENSION,
        daysRemaining: daysLeft,
        amount: totals.totalPension,
        status: pensionRow.status,
        dueDate: dueStr,
        collectingAuthority: totals.primaryPfa,
      },
    ];

    return {
      period: key,
      totalPayroll: totals.totalPayroll,
      netPayout: totals.netPayout,
      totalDeduction: totals.totalDeduction,
      statutoryObligations,
      complianceCalendar: statutoryObligations.map((o) => ({
        obligationType: o.type,
        dateDue: o.dueDate,
      })),
      totalEmployee: totals.activeEmployeeCount,
      /** Client downloads via GET /mobile/payroll/annual-report */
      annualReport: `/api/v1/mobile/payroll/annual-report?period=${key}`,
    };
  },

  async getPayee(userId: string, periodQuery?: string) {
    const { year, month, key } = parsePeriod(periodQuery);
    const due = dueDateForPeriod(year, month);
    const daysLeft = daysRemainingUntil(due);
    const dueStr = formatDateYmd(due);

    const [employees, settings] = await Promise.all([
      prisma.employee.findMany({ where: { userId } }),
      getOrCreateSettings(userId),
    ]);
    const totals = computePeriodTotals(employees, settings.isNhfApplicable, key);
    const payeAuth = await resolvePayeAuthority(userId);
    const row = await upsertObligationSnapshot(
      userId,
      OBLIGATION_TYPE.PAYE,
      key,
      totals.totalPaye,
      due,
      payeAuth,
    );
    const history = await historyForType(userId, OBLIGATION_TYPE.PAYE);

    return {
      summary: {
        collectingAuthority: payeAuth,
        filingDeadline: dueStr,
        daysLeft,
        amountDue: totals.totalPaye,
        period: key,
        status: row.status,
      },
      employeeDetails: totals.payeLines,
      schedule: {
        collectingAuthority: payeAuth,
        taxPeriod: key,
        filingDeadline: dueStr,
        remittanceMethod: REMITTANCE_METHOD_DEFAULT,
        amountDue: totals.totalPaye,
      },
      history,
    };
  },

  async getNhf(userId: string, periodQuery?: string) {
    const { year, month, key } = parsePeriod(periodQuery);
    const due = dueDateForPeriod(year, month);
    const dueStr = formatDateYmd(due);
    const settings = await getOrCreateSettings(userId);
    if (!settings.isNhfApplicable) {
      return {
        summary: {
          amount: 0,
          status: OBLIGATION_STATUS.PENDING,
          period: key,
          collectingAuthority: NHF_COLLECTING_AUTHORITY,
          rate: NHF_RATE,
          filingAuthority: NHF_COLLECTING_AUTHORITY,
          isNhfApplicable: false,
        },
        employeeDetails: [],
        schedule: {
          collectingAuthority: NHF_COLLECTING_AUTHORITY,
          legalBasis: NHF_LEGAL_BASIS,
          rate: NHF_RATE,
          filingDeadline: dueStr,
          applicableEmployee: 0,
          totalDueAmount: 0,
        },
        history: await historyForType(userId, OBLIGATION_TYPE.NHF),
        isNhfApplicable: false,
      };
    }

    const employees = await prisma.employee.findMany({ where: { userId } });
    const totals = computePeriodTotals(employees, true, key);
    const row = await upsertObligationSnapshot(
      userId,
      OBLIGATION_TYPE.NHF,
      key,
      totals.totalNhf,
      due,
      NHF_COLLECTING_AUTHORITY,
    );

    return {
      summary: {
        amount: totals.totalNhf,
        status: row.status,
        period: key,
        collectingAuthority: NHF_COLLECTING_AUTHORITY,
        rate: NHF_RATE,
        filingAuthority: NHF_COLLECTING_AUTHORITY,
        isNhfApplicable: true,
      },
      employeeDetails: totals.nhfLines,
      schedule: {
        collectingAuthority: NHF_COLLECTING_AUTHORITY,
        legalBasis: NHF_LEGAL_BASIS,
        rate: NHF_RATE,
        filingDeadline: dueStr,
        applicableEmployee: totals.applicableNhfCount,
        totalDueAmount: totals.totalNhf,
      },
      history: await historyForType(userId, OBLIGATION_TYPE.NHF),
      isNhfApplicable: true,
    };
  },

  async setNhfApplicability(userId: string, isNhfApplicable: boolean) {
    const settings = await prisma.payrollSettings.upsert({
      where: { userId },
      create: { userId, isNhfApplicable },
      update: { isNhfApplicable },
    });
    return { isNhfApplicable: settings.isNhfApplicable };
  },

  async getPension(userId: string, periodQuery?: string) {
    const { year, month, key } = parsePeriod(periodQuery);
    const due = dueDateForPeriod(year, month);
    const daysLeft = daysRemainingUntil(due);
    const dueStr = formatDateYmd(due);

    const [employees, settings] = await Promise.all([
      prisma.employee.findMany({ where: { userId } }),
      getOrCreateSettings(userId),
    ]);
    const totals = computePeriodTotals(employees, settings.isNhfApplicable, key);
    const row = await upsertObligationSnapshot(
      userId,
      OBLIGATION_TYPE.PENSION,
      key,
      totals.totalPension,
      due,
      totals.primaryPfa,
    );

    return {
      summary: {
        period: key,
        totalAmount: totals.totalPension,
        status: row.status,
        employeePercent: PENSION_EMPLOYEE_RATE,
        employerPercent: PENSION_EMPLOYER_RATE,
        filingDeadline: dueStr,
        daysLeft,
      },
      employeeDetails: totals.pensionLines,
      schedule: {
        remittanceType: REMITTANCE_METHOD_DEFAULT,
        regulatoryBasis: PENSION_REGULATORY_BASIS,
        employeeRate: PENSION_EMPLOYEE_RATE,
        employerRate: PENSION_EMPLOYER_RATE,
        filingDeadline: dueStr,
        totalAmountDue: totals.totalPension,
      },
      totalNoOfPfas: totals.totalNoOfPfas,
      history: await historyForType(userId, OBLIGATION_TYPE.PENSION),
    };
  },

  async uploadEvidence(
    userId: string,
    type: ObligationType,
    period: string,
    data: { url: string; evidenceType: string },
  ) {
    if (!data.url?.trim() || !data.evidenceType?.trim()) {
      throw new HttpReplyError(400, "url and evidenceType are required");
    }
    const { year, month, key } = parsePeriod(period);
    const due = dueDateForPeriod(year, month);
    const amount = await this.liveAmountForType(userId, type, key);
    const authority = await this.authorityForType(userId, type);
    const row = await upsertObligationSnapshot(
      userId,
      type,
      key,
      amount,
      due,
      authority,
    );
    const entry = `${data.evidenceType}:${data.url}`;
    const evidenceUrls = [...row.evidenceUrls, entry];
    const updated = await prisma.payrollObligation.update({
      where: { id: row.id },
      data: { evidenceUrls },
    });
    return {
      type,
      period: key,
      evidenceUrls: updated.evidenceUrls,
      evidenceType: data.evidenceType,
      url: data.url,
    };
  },

  async assignConsultant(
    userId: string,
    type: ObligationType,
    period: string,
    consultantId: string,
  ) {
    if (!consultantId?.trim()) {
      throw new HttpReplyError(400, "consultantId is required");
    }
    const { year, month, key } = parsePeriod(period);
    const due = dueDateForPeriod(year, month);
    const amount = await this.liveAmountForType(userId, type, key);
    const authority = await this.authorityForType(userId, type);
    const row = await upsertObligationSnapshot(
      userId,
      type,
      key,
      amount,
      due,
      authority,
    );
    const updated = await prisma.payrollObligation.update({
      where: { id: row.id },
      data: { assignedConsultantId: consultantId },
    });
    return {
      type,
      period: key,
      assignedConsultantId: updated.assignedConsultantId,
    };
  },

  async markAsPaid(userId: string, type: ObligationType, period: string) {
    const { year, month, key } = parsePeriod(period);
    const due = dueDateForPeriod(year, month);
    const amount = await this.liveAmountForType(userId, type, key);
    const authority = await this.authorityForType(userId, type);
    const row = await upsertObligationSnapshot(
      userId,
      type,
      key,
      amount,
      due,
      authority,
    );
    const updated = await prisma.payrollObligation.update({
      where: { id: row.id },
      data: {
        status: OBLIGATION_STATUS.PAID,
        paidAt: new Date(),
        amount: new Decimal(amount),
      },
    });
    await ledgerPostingService.postPayrollRemittance(
      userId,
      updated.id,
      type,
      amount,
      updated.paidAt ?? new Date(),
    );
    return {
      type,
      period: key,
      status: updated.status,
      paidAt: updated.paidAt?.toISOString() ?? null,
      amount: decimalToNumber(updated.amount),
    };
  },

  async pay(userId: string, type: ObligationType, period: string) {
    const { year, month, key } = parsePeriod(period);
    const due = dueDateForPeriod(year, month);
    const amount = await this.liveAmountForType(userId, type, key);
    const authority = await this.authorityForType(userId, type);
    const row = await upsertObligationSnapshot(
      userId,
      type,
      key,
      amount,
      due,
      authority,
    );
    if (row.status === OBLIGATION_STATUS.PAID) {
      throw new HttpReplyError(400, "This obligation is already marked PAID");
    }
    const url =
      row.paymentLink ??
      `${PAYMENT_BASE_URL}/payroll/${type.toLowerCase()}/${key}/${row.id}`;
    if (!row.paymentLink) {
      await prisma.payrollObligation.update({
        where: { id: row.id },
        data: { paymentLink: url },
      });
    }
    return { url };
  },

  async liveAmountForType(
    userId: string,
    type: ObligationType,
    _period: string,
  ): Promise<number> {
    const [employees, settings] = await Promise.all([
      prisma.employee.findMany({ where: { userId } }),
      getOrCreateSettings(userId),
    ]);
    if (type === OBLIGATION_TYPE.NHF && !settings.isNhfApplicable) {
      throw new HttpReplyError(400, "NHF is not applicable for this business");
    }
    const totals = computePeriodTotals(
      employees,
      settings.isNhfApplicable,
      _period,
    );
    if (type === OBLIGATION_TYPE.PAYE) return totals.totalPaye;
    if (type === OBLIGATION_TYPE.NHF) return totals.totalNhf;
    return totals.totalPension;
  },

  async authorityForType(
    userId: string,
    type: ObligationType,
  ): Promise<string> {
    if (type === OBLIGATION_TYPE.PAYE) return resolvePayeAuthority(userId);
    if (type === OBLIGATION_TYPE.NHF) return NHF_COLLECTING_AUTHORITY;
    const employees = await prisma.employee.findMany({
      where: { userId },
      select: { pfa: true },
    });
    const pfa = employees.map((e) => e.pfa?.trim()).find(Boolean);
    return pfa || "Pension Fund Administrators";
  },

  async generateAnnualReportPdf(
    userId: string,
    periodQuery?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { key } = parsePeriod(periodQuery);
    const year = Number(key.slice(0, 4));
    const summary = await this.getSummary(userId, key);
    const [user, business] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { organizationName: true, firstName: true, lastName: true },
      }),
      prisma.business.findFirst({
        where: { userId },
        select: { name: true },
      }),
    ]);
    const org =
      business?.name ||
      user?.organizationName ||
      `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() ||
      "Business";

    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: "A4" });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      doc.fontSize(18).text("Payroll Annual Report", { align: "left" });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("#666").text(`Organization: ${org}`);
      doc.text(`Period reference: ${key} (year ${year})`);
      doc.text(`Generated: ${new Date().toISOString().slice(0, 10)}`);
      doc.moveDown();
      doc.fillColor("#000").fontSize(12).text("Summary");
      doc.fontSize(10);
      doc.text(`Total payroll: ₦${summary.totalPayroll.toLocaleString()}`);
      doc.text(`Net payout: ₦${summary.netPayout.toLocaleString()}`);
      doc.text(`Total deductions: ₦${summary.totalDeduction.toLocaleString()}`);
      doc.text(`Employees: ${summary.totalEmployee}`);
      doc.moveDown();
      doc.fontSize(12).text("Statutory obligations");
      doc.fontSize(10);
      for (const o of summary.statutoryObligations) {
        doc.text(
          `${o.type}: ₦${o.amount.toLocaleString()} · ${o.status} · due ${o.dueDate} · ${o.collectingAuthority}`,
        );
      }
      doc.moveDown();
      doc.fontSize(8).fillColor("#888").text("Generated by Fileam");
      doc.end();
    });

    return {
      buffer,
      filename: `payroll-annual-report-${year}.pdf`,
    };
  },
};
