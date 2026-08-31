import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import {
  computeAnnualPensionable,
  computeAnnualIncome,
  DEFAULT_EMPLOYEE_PENSION_RATE,
  resolveEmployerTaxTreatment,
  type EmployerPaymentFrequency,
  type EmployerPaymentMethod,
  type EmployerRelationship,
  type EmployerTaxTreatment,
  type EmployerType,
} from "../../constants/employer";
import {
  amountsMatch,
  assertRentClaimComplete,
  computePitFromSnapshot,
  isFinalWhtPayerCategory,
  isPitYearOpenForFiling,
  normalizePayerCategory,
  PIT_DEFAULT_WHT_RATE_PERCENT,
  PIT_MINIMUM_WAGE_MONTHLY_NGN,
  PIT_PERIOD_MONTH,
  PIT_STATE_OF_RESIDENCE_VALUES,
  pitDueDateForYear,
  type PitBandResult,
  type PitComputationSnapshot,
} from "../../constants/pitFiling";
import type { PitDraftInputs } from "../../constants/filingWorkspace";
import { PERCENT } from "../../constants/percentages";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";
import { monthDateRangeUtc } from "../../utils/dateRangeQuery";
import { evidenceVaultService } from "./evidenceVaultService";
import { taxComputationService } from "./taxComputationService";
import { sumGeneratedPayeCreditForYear } from "./employersService";
import { copyCarryForwardOnSubmit } from "./filingCarryForwardService";
import { completionPercentFromStep } from "../../constants/filingWorkspace";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") {
    return v.toNumber();
  }
  return Number(v);
}

function employerProfileFromRow(row: {
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

async function getTradingProfitForYear(
  userId: string,
  year: number,
): Promise<number> {
  let total = 0;
  for (let month = 1; month <= 12; month++) {
    const { start, end } = monthDateRangeUtc(year, month);
    const [sales, expenses] = await Promise.all([
      prisma.sale.findMany({
        where: { userId, saleDate: { gte: start, lte: end } },
        select: { amount: true },
      }),
      prisma.expense.findMany({
        where: { userId, expenseDate: { gte: start, lte: end } },
        select: { amount: true },
      }),
    ]);
    const income = sales.reduce((s, x) => s + d(x.amount), 0);
    const exp = expenses.reduce((s, x) => s + d(x.amount), 0);
    total += income - exp;
  }
  return normalizeMoneyAmount(total);
}

type AggregatedInputs = {
  tradingProfit: number;
  otherBusinessIncome: number;
  otherPersonalIncome: number;
  payerFees: number;
  payerFeesIncludedInSales: boolean;
  pensionContribution: number;
  payeCredits: number;
  whtCredits: number;
  minimumWageExempt: boolean;
  employmentTaxable: number;
  employmentExempt: number;
  employerWhtCredits: number;
  payerWhtCredits: number;
  payerFeesRecorded: number;
};

async function aggregatePitInputs(
  userId: string,
  year: number,
  opts?: { payerFeesIncludedInSales?: boolean },
): Promise<AggregatedInputs> {
  const tradingProfit = await getTradingProfitForYear(userId, year);
  const payerFeesIncludedInSales =
    opts?.payerFeesIncludedInSales ?? tradingProfit > 0;

  let employmentTaxable = 0;
  let employmentExempt = 0;
  let pensionContribution = 0;
  let payeCredits = 0;
  let employerWhtCredits = 0;

  const employers = await prisma.employer.findMany({ where: { userId } });
  for (const row of employers) {
    const profile = employerProfileFromRow(row);
    const taxTreatment = resolveEmployerTaxTreatment(
      profile.employerType,
      profile.relationship,
    );
    const annualGross = computeAnnualIncome(profile);
    const isContractor = profile.relationship === "CONTRACTOR";
    const minWageExempt =
      !isContractor &&
      annualGross > 0 &&
      annualGross / 12 <= PIT_MINIMUM_WAGE_MONTHLY_NGN;

    if (minWageExempt) {
      employmentExempt = normalizeMoneyAmount(employmentExempt + annualGross);
    } else {
      employmentTaxable = normalizeMoneyAmount(
        employmentTaxable + annualGross,
      );
    }

    if (row.hasPension) {
      const pensionable = computeAnnualPensionable(profile);
      const rate = d(row.employeeRate ?? DEFAULT_EMPLOYEE_PENSION_RATE);
      pensionContribution = normalizeMoneyAmount(
        pensionContribution + Math.round((pensionable * rate) / PERCENT),
      );
    }

    const payeCredit = sumGeneratedPayeCreditForYear(row, taxTreatment, year);
    if (taxTreatment === "PAYE" && payeCredit > 0) {
      payeCredits = normalizeMoneyAmount(payeCredits + payeCredit);
    }
    if (taxTreatment === "WHT") {
      const whtRate = 5;
      employerWhtCredits = normalizeMoneyAmount(
        employerWhtCredits +
          Math.round((annualGross * whtRate) / PERCENT),
      );
    }
  }

  if (employers.length === 0) {
    const persona = await taxComputationService.getPersonaPayloadForUser(userId);
    const monthly = persona.employmentGrossSalaryMonthly ?? 0;
    if (monthly > 0) {
      const annual = monthly * 12;
      if (monthly <= PIT_MINIMUM_WAGE_MONTHLY_NGN) {
        employmentExempt = annual;
      } else {
        employmentTaxable = annual;
      }
    }
  }

  let payerFeesRecorded = 0;
  let payerWhtCredits = 0;
  const payers = await prisma.payer.findMany({
    where: { userId },
    include: {
      transactions: { where: { status: { not: "VOID" } } },
    },
  });
  for (const payer of payers) {
    const category = normalizePayerCategory(payer.category);
    if (isFinalWhtPayerCategory(category)) continue;
    const totalAmount = normalizeMoneyAmount(
      payer.transactions.reduce((s, t) => s + d(t.amount), 0),
    );
    payerFeesRecorded = normalizeMoneyAmount(payerFeesRecorded + totalAmount);
    if (payer.whtApplicable) {
      const whtRate = d(payer.whtRate) || PIT_DEFAULT_WHT_RATE_PERCENT;
      payerWhtCredits = normalizeMoneyAmount(
        payerWhtCredits +
          Math.round((totalAmount * whtRate) / PERCENT),
      );
    }
  }

  const payerFeesAdded = payerFeesIncludedInSales ? 0 : payerFeesRecorded;
  const minimumWageExempt =
    employmentExempt > 0 &&
    employmentTaxable === 0 &&
    tradingProfit + 0 + payerFeesAdded <= 0;

  return {
    tradingProfit,
    otherBusinessIncome: 0,
    otherPersonalIncome: employmentTaxable,
    payerFees: payerFeesRecorded,
    payerFeesIncludedInSales,
    pensionContribution,
    payeCredits,
    whtCredits: normalizeMoneyAmount(employerWhtCredits + payerWhtCredits),
    minimumWageExempt,
    employmentTaxable,
    employmentExempt,
    employerWhtCredits,
    payerWhtCredits,
    payerFeesRecorded,
  };
}

function applyPitDraft(
  inputs: AggregatedInputs,
  draft: PitDraftInputs | null | undefined,
): {
  tradingProfit: number;
  otherBusinessIncome: number;
  otherPersonalIncome: number;
  payerFeesIncludedInSales: boolean;
  reliefs: NonNullable<PitDraftInputs["reliefs"]>;
} {
  const overrides = draft?.incomeOverrides ?? {};
  const reliefs = draft?.reliefs ?? {};
  return {
    tradingProfit:
      overrides.tradingProfit != null
        ? normalizeMoneyAmount(overrides.tradingProfit)
        : inputs.tradingProfit,
    otherBusinessIncome:
      overrides.otherBusinessIncome != null
        ? normalizeMoneyAmount(overrides.otherBusinessIncome)
        : inputs.otherBusinessIncome,
    otherPersonalIncome:
      overrides.otherPersonalIncome != null
        ? normalizeMoneyAmount(overrides.otherPersonalIncome)
        : inputs.otherPersonalIncome,
    payerFeesIncludedInSales:
      draft?.payerFeesIncludedInSales ?? inputs.payerFeesIncludedInSales,
    reliefs,
  };
}

async function loadProfileTinAndState(userId: string): Promise<{
  tin: string | null;
  stateOfResidence: string | null;
}> {
  const business = await prisma.business.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { tin: true, stateOfResidence: true },
  });
  return {
    tin: business?.tin?.trim() || null,
    stateOfResidence: business?.stateOfResidence?.trim() || null,
  };
}

function validateSubmitBody(body: Record<string, unknown>): void {
  const periodYear = Number(body.periodYear);
  const periodMonth = Number(body.periodMonth);
  const tin = String(body.tin ?? "").trim();
  const stateOfResidence = String(body.stateOfResidence ?? "").trim();
  const dueDate = String(body.dueDate ?? "");
  const amount = Number(body.amount);
  const computation = body.computation as PitComputationSnapshot | undefined;

  if (!tin) {
    throw new HttpReplyError(
      400,
      "Add your TIN and state of residence before filing.",
      null,
      "VALIDATION_ERROR",
    );
  }
  if (
    !stateOfResidence ||
    !PIT_STATE_OF_RESIDENCE_VALUES.includes(
      stateOfResidence as (typeof PIT_STATE_OF_RESIDENCE_VALUES)[number],
    )
  ) {
    throw new HttpReplyError(
      400,
      "Add your TIN and state of residence before filing.",
      null,
      "VALIDATION_ERROR",
    );
  }
  if (periodMonth !== PIT_PERIOD_MONTH) {
    throw new HttpReplyError(
      400,
      "PIT filings must use periodMonth 12.",
      null,
      "VALIDATION_ERROR",
    );
  }
  const expectedDue = pitDueDateForYear(periodYear);
  if (dueDate !== expectedDue) {
    throw new HttpReplyError(
      400,
      `dueDate must be ${expectedDue}.`,
      null,
      "VALIDATION_ERROR",
    );
  }
  if (!isPitYearOpenForFiling(periodYear)) {
    throw new HttpReplyError(
      400,
      `The ${periodYear + 1} return can be filed from 1 January ${periodYear + 1}.`,
      null,
      "YEAR_NOT_OPEN",
    );
  }
  if (!computation || typeof computation !== "object") {
    throw new HttpReplyError(
      400,
      "computation is required.",
      null,
      "VALIDATION_ERROR",
    );
  }

  try {
    assertRentClaimComplete(computation);
  } catch {
    throw new HttpReplyError(
      400,
      "Landlord name, contact, address and rent period are required to claim rent relief.",
      null,
      "RENT_CLAIM_INCOMPLETE",
    );
  }

  const recomputed = computePitFromSnapshot({
    tradingProfit: Number(computation.tradingProfit),
    otherBusinessIncome: Number(computation.otherBusinessIncome),
    otherPersonalIncome: Number(computation.otherPersonalIncome),
    payerFees: Number(computation.payerFees),
    payerFeesIncludedInSales: Boolean(computation.payerFeesIncludedInSales),
    pensionContribution: Number(computation.pensionContribution),
    nhfContribution: Number(computation.nhfContribution),
    nhisContribution: Number(computation.nhisContribution),
    annualRent: Number(computation.annualRent),
    rentPeriodStart: computation.rentPeriodStart ?? null,
    rentPeriodEnd: computation.rentPeriodEnd ?? null,
    landlordName: computation.landlordName ?? null,
    landlordContact: computation.landlordContact ?? null,
    propertyAddress: computation.propertyAddress ?? null,
    lifeAssurance: Number(computation.lifeAssurance),
    mortgageInterest: Number(computation.mortgageInterest),
    qualifyingMedicalExpenses: Number(computation.qualifyingMedicalExpenses ?? 0),
    payeCredits: Number(computation.payeCredits),
    whtCredits: Number(computation.whtCredits),
    minimumWageExempt: Boolean(computation.minimumWageExempt),
  });

  if (
    !amountsMatch(recomputed.remainingPayable, amount) ||
    !amountsMatch(recomputed.remainingPayable, computation.remainingPayable)
  ) {
    throw new HttpReplyError(
      400,
      "PIT amount does not match the computation.",
      null,
      "VALIDATION_ERROR",
    );
  }
}

export const pitFilingService = {
  async getCalculation(userId: string, year: number) {
    const [inputs, profile, existing] = await Promise.all([
      aggregatePitInputs(userId, year),
      loadProfileTinAndState(userId),
      prisma.taxPayable.findUnique({
        where: {
          userId_taxType_periodYear_periodMonth: {
            userId,
            taxType: "PIT",
            periodYear: year,
            periodMonth: PIT_PERIOD_MONTH,
          },
        },
      }),
    ]);

    const draftInputs =
      existing?.draftInputs && typeof existing.draftInputs === "object"
        ? (existing.draftInputs as PitDraftInputs)
        : null;

    if (existing?.frozen && existing.computation) {
      const frozen = existing.computation as Record<string, unknown>;
      const storedBands = frozen.bands as PitBandResult[] | undefined;
      const { bands: _b, ...computation } = frozen;
      return {
        year,
        dueDate: pitDueDateForYear(year),
        yearOpenForFiling: isPitYearOpenForFiling(year),
        alreadyFiled: existing.submittedAt != null,
        filingId: existing.submittedAt != null ? existing.id : null,
        tin: profile.tin,
        stateOfResidence: profile.stateOfResidence,
        computation,
        bands: storedBands ?? [],
        frozen: true,
        warning: existing.booksChangedSinceFreeze
          ? "Books changed since computation was confirmed. Re-confirm step 1 to update figures."
          : undefined,
        inputs: {
          tradingProfit: inputs.tradingProfit,
          employmentTaxable: inputs.employmentTaxable,
          employmentExempt: inputs.employmentExempt,
          payerFeesRecorded: inputs.payerFeesRecorded,
          payerFeesIncludedInSales: inputs.payerFeesIncludedInSales,
          payeCredits: inputs.payeCredits,
          employerWhtCredits: inputs.employerWhtCredits,
          payerWhtCredits: inputs.payerWhtCredits,
        },
      };
    }

    const merged = applyPitDraft(inputs, draftInputs);
    const extraPension = merged.reliefs.extraPension ?? 0;
    const pensionOverride = merged.reliefs.pensionOverride;
    const pensionContribution =
      pensionOverride != null
        ? normalizeMoneyAmount(pensionOverride)
        : normalizeMoneyAmount(inputs.pensionContribution + extraPension);

    const snapshot = computePitFromSnapshot({
      tradingProfit: merged.tradingProfit,
      otherBusinessIncome: merged.otherBusinessIncome,
      otherPersonalIncome: merged.otherPersonalIncome,
      payerFees: merged.payerFeesIncludedInSales ? 0 : inputs.payerFees,
      payerFeesIncludedInSales: merged.payerFeesIncludedInSales,
      pensionContribution,
      nhfContribution: merged.reliefs.nhfOverride ?? merged.reliefs.nhfContribution ?? 0,
      nhisContribution: merged.reliefs.nhisContribution ?? 0,
      annualRent: merged.reliefs.annualRent ?? 0,
      rentPeriodStart: merged.reliefs.rentPeriodStart ?? null,
      rentPeriodEnd: merged.reliefs.rentPeriodEnd ?? null,
      landlordName: merged.reliefs.landlordName ?? null,
      landlordContact: merged.reliefs.landlordContact ?? null,
      propertyAddress: merged.reliefs.propertyAddress ?? null,
      lifeAssurance: merged.reliefs.lifeAssurance ?? 0,
      mortgageInterest: merged.reliefs.mortgageInterest ?? 0,
      qualifyingMedicalExpenses: merged.reliefs.qualifyingMedicalExpenses ?? 0,
      payeCredits: inputs.payeCredits,
      whtCredits: inputs.whtCredits,
      minimumWageExempt: inputs.minimumWageExempt,
    });

    const { bands, ...computation } = snapshot;

    return {
      year,
      dueDate: pitDueDateForYear(year),
      yearOpenForFiling: isPitYearOpenForFiling(year),
      alreadyFiled: existing?.submittedAt != null,
      filingId: existing?.submittedAt != null ? existing.id : null,
      tin: profile.tin,
      stateOfResidence: profile.stateOfResidence,
      computation,
      bands: bands as PitBandResult[],
      draftApplied: draftInputs != null,
      inputs: {
        tradingProfit: inputs.tradingProfit,
        employmentTaxable: inputs.employmentTaxable,
        employmentExempt: inputs.employmentExempt,
        payerFeesRecorded: inputs.payerFeesRecorded,
        payerFeesIncludedInSales: merged.payerFeesIncludedInSales,
        payeCredits: inputs.payeCredits,
        employerWhtCredits: inputs.employerWhtCredits,
        payerWhtCredits: inputs.payerWhtCredits,
      },
    };
  },

  async submit(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<{ id: string; status: string; submissionDate: Date; completionPercent?: number }> {
    validateSubmitBody(body);

    const periodYear = Number(body.periodYear);
    const amount = Number(body.amount);
    const tin = String(body.tin).trim();
    const stateOfResidence = String(body.stateOfResidence).trim();
    const dueDate = new Date(String(body.dueDate));
    const paymentStatus =
      body.paymentStatus === "paid" ? "paid" : "unpaid";
    const evidenceVaultId =
      body.evidenceVaultId != null && String(body.evidenceVaultId).trim() !== ""
        ? String(body.evidenceVaultId)
        : null;

    if (evidenceVaultId) {
      const doc = await evidenceVaultService.getDocumentById(
        userId,
        evidenceVaultId,
      );
      if (!doc) {
        throw new HttpReplyError(
          400,
          "Evidence vault document not found.",
          null,
          "VALIDATION_ERROR",
        );
      }
    }

    const existing = await prisma.taxPayable.findUnique({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "PIT",
          periodYear,
          periodMonth: PIT_PERIOD_MONTH,
        },
      },
    });
    if (existing?.submittedAt != null) {
      throw new HttpReplyError(
        409,
        `PIT return already recorded for ${periodYear}.`,
        null,
        "DUPLICATE_FILING",
      );
    }

    const computation = body.computation as PitComputationSnapshot;
    const submittedAt = new Date();
    const payableStatus =
      amount <= 0 || paymentStatus === "paid" ? "paid" : "pending";
    const storedPaymentStatus =
      amount <= 0 || paymentStatus === "paid" ? "paid" : "unpaid";

    const submissionReference =
      body.submissionReference != null
        ? String(body.submissionReference).trim()
        : "";
    const completedSteps = Array.from({ length: 8 }, (_, i) => i + 1);

    const taxPayable = await prisma.taxPayable.upsert({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "PIT",
          periodYear,
          periodMonth: PIT_PERIOD_MONTH,
        },
      },
      create: {
        userId,
        taxType: "PIT",
        periodYear,
        periodMonth: PIT_PERIOD_MONTH,
        amountDue: new Decimal(amount),
        penalties: new Decimal(0),
        totalPayable: new Decimal(amount),
        filingDueDate: dueDate,
        status: payableStatus,
        paymentStatus: storedPaymentStatus,
        submittedAt,
        tin,
        stateOfResidence,
        computation: computation as object,
        documentUrl:
          body.documentUrl != null ? String(body.documentUrl) : null,
        evidenceVaultId,
        receiptUrl: body.receiptUrl != null ? String(body.receiptUrl) : null,
        submissionReference: submissionReference || null,
        currentStep: 8,
        completedSteps,
        frozen: true,
        frozenAt: submittedAt,
      },
      update: {
        amountDue: new Decimal(amount),
        totalPayable: new Decimal(amount),
        filingDueDate: dueDate,
        status: payableStatus,
        paymentStatus: storedPaymentStatus,
        submittedAt,
        tin,
        stateOfResidence,
        computation: computation as object,
        documentUrl:
          body.documentUrl != null ? String(body.documentUrl) : null,
        evidenceVaultId,
        receiptUrl: body.receiptUrl != null ? String(body.receiptUrl) : null,
        submissionReference: submissionReference || null,
        currentStep: 8,
        completedSteps,
        frozen: true,
        frozenAt: submittedAt,
      },
    });

    await copyCarryForwardOnSubmit(
      userId,
      "PIT",
      periodYear,
      PIT_PERIOD_MONTH,
      computation as unknown as Record<string, unknown>,
    );

    await prisma.filingTimelineEvent.create({
      data: {
        taxPayableId: taxPayable.id,
        event: "SUBMITTED",
        description: "PIT annual return recorded",
        eventDate: submittedAt,
      },
    });

    return {
      id: taxPayable.id,
      status: "submitted",
      submissionDate: submittedAt,
      completionPercent: completionPercentFromStep(8),
    };
  },

  async saveDraft(userId: string, body: PitDraftInputs & { periodYear: number }) {
    const { filingWorkspaceService } = await import("./filingWorkspaceService");
    return filingWorkspaceService.savePitDraft(userId, body);
  },
};
