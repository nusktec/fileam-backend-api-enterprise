import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  computeAnnualIncome,
  computeEmployeePensionAnnual,
  computeEmployerTaxComputation,
  computeMonthlyIncome,
  DEFAULT_EMPLOYEE_PENSION_RATE,
  DEFAULT_EMPLOYER_PENSION_RATE,
  employerDocumentCategoryLabel,
  formatTodayYmd,
  MAX_MONEY_NGN,
  normalizeEmployerDocumentKind,
  resolveEmployerTaxTreatment,
  resolveEmploymentStatus,
  resolveIncomeKind,
  taxEvidenceCategoryLabel,
  taxEvidenceTitle,
  type EmployerDocumentKind,
  type EmployerPaymentFrequency,
  type EmployerPaymentMethod,
  type EmployerRelationship,
  type EmployerRemunerationInput,
  type EmployerTaxTreatment,
  type EmployerType,
  type EmploymentStatus,
  type PensionStatus,
} from "../../constants/employer";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

function assertMoney(field: string, value: number) {
  if (value < 0 || value > MAX_MONEY_NGN) {
    throw new HttpReplyError(400, `${field} is out of allowed range`);
  }
}

function remunerationFromRow(row: {
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
    paymentMethod: row.paymentMethod as EmployerPaymentMethod,
    paymentFrequency: row.paymentFrequency as EmployerPaymentFrequency,
    basicSalary: d(row.basicSalary),
    housingAllowance: d(row.housingAllowance),
    transportAllowance: d(row.transportAllowance),
    otherAllowances: d(row.otherAllowances),
    bonuses: d(row.bonuses),
    commissions: d(row.commissions),
    hasPension: row.hasPension,
    employeeRate: row.employeeRate != null ? d(row.employeeRate) : null,
  };
}

function profileFromRow(row: {
  employerType: string;
  relationship: string;
  endDate: string | null;
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
}) {
  return {
    employerType: row.employerType as EmployerType,
    relationship: row.relationship as EmployerRelationship,
    endDate: row.endDate,
    ...remunerationFromRow(row),
  };
}

function mapEmployerRow(
  row: {
    id: string;
    employerType: string;
    name: string;
    address: string;
    relationship: string;
    stateOfEmployment: string;
    startDate: string;
    endDate: string | null;
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
    rsaPin: string | null;
    pfa: string | null;
    employeeRate: Decimal | null;
    employerRate: Decimal | null;
    cacNumber: string | null;
    tin: string | null;
    email: string | null;
    phone: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
  payeCredit: number,
  includeTaxComputation = false,
) {
  const profile = profileFromRow(row);
  const taxTreatment = resolveEmployerTaxTreatment(
    profile.employerType,
    profile.relationship,
  );
  const incomeKind = resolveIncomeKind(profile.relationship);
  const monthlyIncome = computeMonthlyIncome(profile);
  const annualIncome = computeAnnualIncome(profile);
  const whtRate = taxTreatment === "WHT" ? 5 : 0;
  const employmentStatus = resolveEmploymentStatus(row.endDate);

  const base: Record<string, unknown> = {
    id: row.id,
    employerType: row.employerType,
    name: row.name,
    address: row.address,
    cacNumber: row.cacNumber,
    tin: row.tin,
    email: row.email,
    phone: row.phone,
    relationship: row.relationship,
    stateOfEmployment: row.stateOfEmployment,
    startDate: row.startDate,
    endDate: row.endDate,
    employmentStatus,
    paymentMethod: row.paymentMethod,
    paymentFrequency: row.paymentFrequency,
    basicSalary: d(row.basicSalary),
    housingAllowance: d(row.housingAllowance),
    transportAllowance: d(row.transportAllowance),
    otherAllowances: d(row.otherAllowances),
    bonuses: d(row.bonuses),
    commissions: d(row.commissions),
    monthlyIncome,
    annualIncome,
    hasPension: row.hasPension,
    taxTreatment,
    incomeKind,
    payeCredit,
    whtRate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.hasPension) {
    base.pensionStatus = row.pensionStatus;
    base.rsaPin = row.rsaPin;
    base.pfa = row.pfa;
    base.employeeRate = d(row.employeeRate ?? DEFAULT_EMPLOYEE_PENSION_RATE);
    base.employerRate = d(row.employerRate ?? DEFAULT_EMPLOYER_PENSION_RATE);
  }

  if (includeTaxComputation) {
    const taxComputation = computeEmployerTaxComputation(profile, payeCredit);
    base.taxComputation = {
      treatment: taxComputation.treatment,
      incomeKind: taxComputation.incomeKind,
      annualGross: taxComputation.annualGross,
      monthlyGross: taxComputation.monthlyGross,
      months: taxComputation.months,
      annualPensionable: taxComputation.annualPensionable,
      employeeRate: taxComputation.employeeRate,
      employerRate: taxComputation.employerRate,
      employeePension: taxComputation.employeePension,
      employerPension: taxComputation.employerPension,
      minimumWageExempt: taxComputation.minimumWageExempt,
      chargeableIncome: taxComputation.chargeableIncome,
      bands: taxComputation.bands,
      pitPayable: taxComputation.pitPayable,
      sourceTax: taxComputation.sourceTax,
      sourceTaxIsEstimated: taxComputation.sourceTaxIsEstimated,
      whtRate: taxComputation.whtRate,
      netLiability: taxComputation.netLiability,
      effectiveRate: taxComputation.effectiveRate,
    };
  }

  return base;
}

async function seedDocumentSlots(
  employerId: string,
  input: {
    relationship: EmployerRelationship;
    taxTreatment: EmployerTaxTreatment;
    hasPension: boolean;
  },
) {
  const year = new Date().getFullYear();
  const contractTitle =
    input.relationship === "CONTRACTOR"
      ? "Service Contract"
      : "Employment Contract";
  const slots: Array<{
    title: string;
    kind: EmployerDocumentKind;
    categoryLabel: string;
    required: boolean;
  }> = [
    {
      title: contractTitle,
      kind: "CONTRACT",
      categoryLabel: employerDocumentCategoryLabel("CONTRACT", {
        taxTreatment: input.taxTreatment,
        relationship: input.relationship,
      }),
      required: true,
    },
    {
      title: taxEvidenceTitle(input.taxTreatment, year),
      kind: "PAYE_EVIDENCE",
      categoryLabel: taxEvidenceCategoryLabel(input.taxTreatment),
      required: true,
    },
    {
      title: "Annual Tax Certificate",
      kind: "PAYE_EVIDENCE",
      categoryLabel: "Annual Tax Certificate",
      required: true,
    },
  ];

  if (input.hasPension) {
    slots.push({
      title: `RSA Statement ${year}`,
      kind: "PENSION_STATEMENT",
      categoryLabel: "Pension Statement",
      required: true,
    });
  }

  await prisma.employerDocument.createMany({
    data: slots.map((s) => ({
      employerId,
      title: s.title,
      kind: s.kind,
      categoryLabel: s.categoryLabel,
      status: "MISSING",
      required: s.required,
    })),
  });
}

async function findOwnedEmployer(userId: string, employerId: string) {
  const row = await prisma.employer.findFirst({
    where: { id: employerId, userId },
  });
  if (!row) throw new HttpReplyError(404, "Employer not found");
  return row;
}


function generateScheduledIncomeRows(
  employer: ReturnType<typeof profileFromRow> & {
    startDate: string;
    endDate?: string | null;
  },
  year: number,
) {
  const monthlyGross = computeMonthlyIncome(employer);
  const monthlyTax =
    computeEmployerTaxComputation(employer, 0).pitPayable / 12;
  const monthlyPension = employer.hasPension
    ? computeEmployeePensionAnnual(employer) / 12
    : 0;

  const start = employer.startDate.slice(0, 7);
  const endEmployment = employer.endDate?.slice(0, 7) ?? null;
  const yearPrefix = String(year);
  const now = formatTodayYmd().slice(0, 7);
  const entries: Array<{
    period: string;
    gross: number;
    taxDeducted: number;
    pension: number;
    includesBonus: boolean;
  }> = [];

  if (employer.paymentFrequency === "ONE_OFF") {
    const period = start.startsWith(yearPrefix) ? start : `${yearPrefix}-01`;
    if (period.startsWith(yearPrefix)) {
      if (!endEmployment || period <= endEmployment) {
        entries.push({
          period,
          gross: normalizeMoneyAmount(computeAnnualIncome(employer)),
          taxDeducted: normalizeMoneyAmount(
            Math.round(computeEmployerTaxComputation(employer, 0).pitPayable),
          ),
          pension: normalizeMoneyAmount(
            Math.round(computeEmployeePensionAnnual(employer)),
          ),
          includesBonus: false,
        });
      }
    }
    return entries;
  }

  let cursor = `${yearPrefix}-01`;
  if (start > cursor) cursor = start;
  let end = now.startsWith(yearPrefix) ? now : `${yearPrefix}-12`;
  if (endEmployment && endEmployment < end) end = endEmployment;

  while (cursor <= end) {
    entries.push({
      period: cursor,
      gross: normalizeMoneyAmount(monthlyGross),
      taxDeducted: normalizeMoneyAmount(Math.round(monthlyTax)),
      pension: normalizeMoneyAmount(Math.round(monthlyPension)),
      includesBonus: false,
    });
    const [y, m] = cursor.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
    cursor = next;
  }

  return entries;
}

function autoIncomeHistoryYears(startDate: string): string[] {
  const startYear = Number.parseInt(startDate.slice(0, 4), 10);
  const currentYear = new Date().getFullYear();
  const years: string[] = [];
  for (let y = currentYear; y >= startYear; y--) {
    years.push(String(y));
  }
  return years.length > 0 ? years : [String(currentYear)];
}

function buildAutoIncomeHistoryResponse(
  employerId: string,
  row: {
    startDate: string;
    endDate: string | null;
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
    employeeRate: Decimal | null;
  },
  year: number,
) {
  const profile = profileFromRow(row);
  const taxTreatment = resolveEmployerTaxTreatment(
    profile.employerType,
    profile.relationship,
  );
  const scheduled = generateScheduledIncomeRows(
    { ...profile, startDate: row.startDate, endDate: row.endDate },
    year,
  );
  const mapped = scheduled.map((s) => ({
    id: `${employerId}:${s.period}`,
    period: s.period,
    gross: s.gross,
    taxDeducted: s.taxDeducted,
    pension: s.pension,
    net: normalizeMoneyAmount(s.gross - s.taxDeducted - s.pension),
    includesBonus: s.includesBonus,
  }));
  const totalGross = normalizeMoneyAmount(
    mapped.reduce((s, e) => s + e.gross, 0),
  );
  const totalTax = normalizeMoneyAmount(
    mapped.reduce((s, e) => s + e.taxDeducted, 0),
  );
  const totalPension = normalizeMoneyAmount(
    mapped.reduce((s, e) => s + e.pension, 0),
  );

  return {
    year: String(year),
    taxTreatment,
    sourceTaxLabel:
      taxTreatment === "PAYE"
        ? "PAYE"
        : taxTreatment === "WHT"
          ? "WHT"
          : "Tax",
    totalGross,
    totalTax,
    totalPension,
    totalNet: normalizeMoneyAmount(totalGross - totalTax),
    availableYears: autoIncomeHistoryYears(row.startDate),
    entries: mapped,
  };
}

/** PAYE credit from auto-generated monthly history (not stored rows). */
export function sumGeneratedPayeCreditForYear(
  row: {
    startDate: string;
    endDate: string | null;
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
    employeeRate: Decimal | null;
  },
  taxTreatment: EmployerTaxTreatment,
  year: number,
): number {
  if (taxTreatment !== "PAYE") return 0;
  const profile = profileFromRow(row);
  const scheduled = generateScheduledIncomeRows(
    { ...profile, startDate: row.startDate, endDate: row.endDate },
    year,
  );
  return normalizeMoneyAmount(
    scheduled.reduce((s, e) => s + e.taxDeducted, 0),
  );
}

export const employersService = {
  async create(
    userId: string,
    body: {
      employerType: EmployerType;
      name: string;
      address: string;
      relationship: EmployerRelationship;
      stateOfEmployment: string;
      startDate: string;
      endDate?: string | null;
      paymentMethod: EmployerPaymentMethod;
      paymentFrequency: EmployerPaymentFrequency;
      basicSalary: number;
      hasPension: boolean;
      cacNumber?: string;
      tin?: string;
      email?: string;
      phone?: string;
      housingAllowance?: number;
      transportAllowance?: number;
      otherAllowances?: number;
      bonuses?: number;
      commissions?: number;
      pensionStatus?: PensionStatus;
      rsaPin?: string;
      pfa?: string;
      employeeRate?: number;
      employerRate?: number;
    },
  ) {
    for (const [field, value] of Object.entries({
      basicSalary: body.basicSalary,
      housingAllowance: body.housingAllowance ?? 0,
      transportAllowance: body.transportAllowance ?? 0,
      otherAllowances: body.otherAllowances ?? 0,
      bonuses: body.bonuses ?? 0,
      commissions: body.commissions ?? 0,
    })) {
      assertMoney(field, value);
    }

    if (
      body.paymentMethod === "ONE_OFF" &&
      body.paymentFrequency !== "ONE_OFF"
    ) {
      throw new HttpReplyError(
        400,
        "paymentFrequency must be ONE_OFF when paymentMethod is ONE_OFF",
      );
    }

    if (body.endDate && body.endDate < body.startDate) {
      throw new HttpReplyError(400, "endDate must be on or after startDate");
    }

    if (body.hasPension && !body.pensionStatus) {
      throw new HttpReplyError(400, "pensionStatus is required when hasPension is true");
    }

    const taxTreatment = resolveEmployerTaxTreatment(
      body.employerType,
      body.relationship,
    );

    const employer = await prisma.employer.create({
      data: {
        userId,
        employerType: body.employerType,
        name: body.name.trim(),
        address: body.address.trim(),
        relationship: body.relationship,
        stateOfEmployment: body.stateOfEmployment,
        startDate: body.startDate,
        endDate: body.endDate ?? null,
        paymentMethod: body.paymentMethod,
        paymentFrequency: body.paymentFrequency,
        basicSalary: body.basicSalary,
        housingAllowance: body.housingAllowance ?? 0,
        transportAllowance: body.transportAllowance ?? 0,
        otherAllowances: body.otherAllowances ?? 0,
        bonuses: body.bonuses ?? 0,
        commissions: body.commissions ?? 0,
        hasPension: body.hasPension,
        pensionStatus: body.hasPension ? (body.pensionStatus ?? null) : null,
        rsaPin: body.hasPension ? (body.rsaPin?.trim() ?? null) : null,
        pfa: body.hasPension ? (body.pfa?.trim() ?? null) : null,
        employeeRate: body.hasPension
          ? (body.employeeRate ?? DEFAULT_EMPLOYEE_PENSION_RATE)
          : null,
        employerRate: body.hasPension
          ? (body.employerRate ?? DEFAULT_EMPLOYER_PENSION_RATE)
          : null,
        cacNumber: body.cacNumber?.trim() ?? null,
        tin: body.tin?.trim() ?? null,
        email: body.email?.trim() ?? null,
        phone: body.phone?.trim() ?? null,
      },
    });

    await seedDocumentSlots(employer.id, {
      relationship: body.relationship,
      taxTreatment,
      hasPension: body.hasPension,
    });

    return mapEmployerRow(employer, 0);
  },

  async list(
    userId: string,
    query: {
      status?: EmploymentStatus;
      taxTreatment?: EmployerTaxTreatment;
      year?: number;
    },
  ) {
    const year = query.year ?? new Date().getFullYear();
    const rows = await prisma.employer.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    const employers = [];
    let totalAnnualIncome = 0;
    let totalPayeDeducted = 0;

    for (const row of rows) {
      const profile = profileFromRow(row);
      const taxTreatment = resolveEmployerTaxTreatment(
        profile.employerType,
        profile.relationship,
      );
      const employmentStatus = resolveEmploymentStatus(row.endDate);
      if (query.status && employmentStatus !== query.status) continue;
      if (query.taxTreatment && taxTreatment !== query.taxTreatment) continue;

      const payeCredit = sumGeneratedPayeCreditForYear(row, taxTreatment, year);
      const mapped = mapEmployerRow(row, payeCredit);
      employers.push(mapped);
      totalAnnualIncome = normalizeMoneyAmount(
        totalAnnualIncome + (mapped.annualIncome as number),
      );
      if (taxTreatment === "PAYE") {
        totalPayeDeducted = normalizeMoneyAmount(
          totalPayeDeducted + payeCredit,
        );
      }
    }

    return {
      totalAnnualIncome,
      totalPayeDeducted,
      employerCount: employers.length,
      employers,
    };
  },

  async getById(userId: string, employerId: string) {
    const row = await findOwnedEmployer(userId, employerId);
    const year = new Date().getFullYear();
    const profile = profileFromRow(row);
    const taxTreatment = resolveEmployerTaxTreatment(
      profile.employerType,
      profile.relationship,
    );
    const payeCredit = sumGeneratedPayeCreditForYear(row, taxTreatment, year);
    return mapEmployerRow(row, payeCredit, true);
  },

  async update(
    userId: string,
    employerId: string,
    body: Partial<{
      employerType: EmployerType;
      name: string;
      address: string;
      relationship: EmployerRelationship;
      stateOfEmployment: string;
      startDate: string;
      endDate: string | null;
      paymentMethod: EmployerPaymentMethod;
      paymentFrequency: EmployerPaymentFrequency;
      basicSalary: number;
      hasPension: boolean;
      cacNumber: string | null;
      tin: string | null;
      email: string | null;
      phone: string | null;
      housingAllowance: number;
      transportAllowance: number;
      otherAllowances: number;
      bonuses: number;
      commissions: number;
      pensionStatus: PensionStatus | null;
      rsaPin: string | null;
      pfa: string | null;
      employeeRate: number | null;
      employerRate: number | null;
    }>,
  ) {
    const existing = await findOwnedEmployer(userId, employerId);
    const hasPension = body.hasPension ?? existing.hasPension;
    const wasPension = existing.hasPension;

    if (body.endDate && (body.startDate ?? existing.startDate) > body.endDate) {
      throw new HttpReplyError(400, "endDate must be on or after startDate");
    }

    const paymentMethod = body.paymentMethod ?? existing.paymentMethod;
    const paymentFrequency =
      body.paymentFrequency ?? existing.paymentFrequency;
    if (
      paymentMethod === "ONE_OFF" &&
      paymentFrequency !== "ONE_OFF"
    ) {
      throw new HttpReplyError(
        400,
        "paymentFrequency must be ONE_OFF when paymentMethod is ONE_OFF",
      );
    }

    const row = await prisma.employer.update({
      where: { id: employerId },
      data: {
        employerType: body.employerType,
        name: body.name?.trim(),
        address: body.address?.trim(),
        relationship: body.relationship,
        stateOfEmployment: body.stateOfEmployment,
        startDate: body.startDate,
        endDate: body.endDate !== undefined ? body.endDate : undefined,
        paymentMethod: body.paymentMethod,
        paymentFrequency: body.paymentFrequency,
        basicSalary: body.basicSalary,
        housingAllowance: body.housingAllowance,
        transportAllowance: body.transportAllowance,
        otherAllowances: body.otherAllowances,
        bonuses: body.bonuses,
        commissions: body.commissions,
        hasPension,
        pensionStatus: hasPension
          ? body.pensionStatus !== undefined
            ? body.pensionStatus
            : existing.pensionStatus
          : null,
        rsaPin: hasPension
          ? body.rsaPin !== undefined
            ? body.rsaPin
            : existing.rsaPin
          : null,
        pfa: hasPension
          ? body.pfa !== undefined
            ? body.pfa
            : existing.pfa
          : null,
        employeeRate: hasPension
          ? body.employeeRate !== undefined
            ? body.employeeRate
            : existing.employeeRate
          : null,
        employerRate: hasPension
          ? body.employerRate !== undefined
            ? body.employerRate
            : existing.employerRate
          : null,
        cacNumber: body.cacNumber !== undefined ? body.cacNumber : undefined,
        tin: body.tin !== undefined ? body.tin : undefined,
        email: body.email !== undefined ? body.email : undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
      },
    });

    if (wasPension && !hasPension) {
      await prisma.employerDocument.deleteMany({
        where: { employerId, kind: "PENSION_STATEMENT" },
      });
    } else if (!wasPension && hasPension) {
      const year = new Date().getFullYear();
      const exists = await prisma.employerDocument.findFirst({
        where: { employerId, kind: "PENSION_STATEMENT" },
      });
      if (!exists) {
        await prisma.employerDocument.create({
          data: {
            employerId,
            title: `RSA Statement ${year}`,
            kind: "PENSION_STATEMENT",
            categoryLabel: "Pension Statement",
            status: "MISSING",
            required: true,
          },
        });
      }
    }

    const year = new Date().getFullYear();
    const profile = profileFromRow(row);
    const taxTreatment = resolveEmployerTaxTreatment(
      profile.employerType,
      profile.relationship,
    );
    const payeCredit = sumGeneratedPayeCreditForYear(row, taxTreatment, year);
    return mapEmployerRow(row, payeCredit, true);
  },

  async remove(userId: string, employerId: string) {
    await findOwnedEmployer(userId, employerId);
    await prisma.employer.delete({ where: { id: employerId } });
  },

  async getIncomeHistory(
    userId: string,
    employerId: string,
    year?: number,
  ) {
    const row = await findOwnedEmployer(userId, employerId);
    const targetYear = year ?? new Date().getFullYear();
    return buildAutoIncomeHistoryResponse(employerId, row, targetYear);
  },

  async listDocuments(
    userId: string,
    employerId: string,
    query: { q?: string; status?: "MISSING" | "LINKED" },
  ) {
    const row = await findOwnedEmployer(userId, employerId);
    const profile = profileFromRow(row);
    const taxTreatment = resolveEmployerTaxTreatment(
      profile.employerType,
      profile.relationship,
    );

    let docs = await prisma.employerDocument.findMany({
      where: { employerId },
      orderBy: { createdAt: "asc" },
    });

    if (query.status) {
      docs = docs.filter((d) => d.status === query.status);
    }
    if (query.q?.trim()) {
      const q = query.q.trim().toLowerCase();
      docs = docs.filter((d) => d.title.toLowerCase().includes(q));
    }

    const missing = docs.filter(
      (d) => d.required && d.status === "MISSING",
    );

    return {
      missingCount: missing.length,
      missingTitles: missing.map((d) => d.title),
      documents: docs.map((d) => ({
        id: d.id,
        employerId: d.employerId,
        title: d.title,
        kind: d.kind,
        categoryLabel: d.categoryLabel,
        date: d.date,
        url: d.url,
        status: d.status,
        required: d.required,
      })),
    };
  },

  async linkDocument(
    userId: string,
    employerId: string,
    body: {
      documentId?: string;
      title?: string;
      kind?: string;
      url: string;
      date?: string;
    },
  ) {
    await findOwnedEmployer(userId, employerId);
    if (!body.url?.trim()) {
      throw new HttpReplyError(400, "url is required");
    }

    if (body.documentId) {
      const slot = await prisma.employerDocument.findFirst({
        where: { id: body.documentId, employerId },
      });
      if (!slot) throw new HttpReplyError(404, "Document not found");

      const updated = await prisma.employerDocument.update({
        where: { id: body.documentId },
        data: {
          title: body.title?.trim() || slot.title,
          kind: body.kind
            ? normalizeEmployerDocumentKind(body.kind)
            : slot.kind,
          url: body.url,
          date: body.date ?? formatTodayYmd(),
          status: "LINKED",
        },
      });

      return {
        id: updated.id,
        employerId: updated.employerId,
        title: updated.title,
        kind: updated.kind,
        categoryLabel: updated.categoryLabel,
        date: updated.date,
        url: updated.url,
        status: updated.status,
        required: updated.required,
      };
    }

    const kind = normalizeEmployerDocumentKind(body.kind ?? "OTHER");
    const row = await findOwnedEmployer(userId, employerId);
    const profile = profileFromRow(row);
    const taxTreatment = resolveEmployerTaxTreatment(
      profile.employerType,
      profile.relationship,
    );

    const created = await prisma.employerDocument.create({
      data: {
        employerId,
        title: body.title?.trim() || "Additional Document",
        kind,
        categoryLabel: employerDocumentCategoryLabel(kind, {
          taxTreatment,
          relationship: profile.relationship,
        }),
        date: body.date ?? formatTodayYmd(),
        url: body.url,
        status: "LINKED",
        required: false,
      },
    });

    return {
      id: created.id,
      employerId: created.employerId,
      title: created.title,
      kind: created.kind,
      categoryLabel: created.categoryLabel,
      date: created.date,
      url: created.url,
      status: created.status,
      required: created.required,
    };
  },

  async patchDocument(
    userId: string,
    employerId: string,
    documentId: string,
    body: { url?: string; date?: string; title?: string },
  ) {
    await findOwnedEmployer(userId, employerId);
    const doc = await prisma.employerDocument.findFirst({
      where: { id: documentId, employerId },
    });
    if (!doc) throw new HttpReplyError(404, "Document not found");

    const updated = await prisma.employerDocument.update({
      where: { id: documentId },
      data: {
        url: body.url ?? undefined,
        date: body.date ?? undefined,
        title: body.title?.trim() ?? undefined,
      },
    });

    return {
      id: updated.id,
      employerId: updated.employerId,
      title: updated.title,
      kind: updated.kind,
      categoryLabel: updated.categoryLabel,
      date: updated.date,
      url: updated.url,
      status: updated.status,
      required: updated.required,
    };
  },

  async deleteDocument(
    userId: string,
    employerId: string,
    documentId: string,
  ) {
    await findOwnedEmployer(userId, employerId);
    const doc = await prisma.employerDocument.findFirst({
      where: { id: documentId, employerId },
    });
    if (!doc) throw new HttpReplyError(404, "Document not found");

    if (doc.required) {
      await prisma.employerDocument.update({
        where: { id: documentId },
        data: { url: null, status: "MISSING", date: null },
      });
    } else {
      await prisma.employerDocument.delete({ where: { id: documentId } });
    }
  },
};
