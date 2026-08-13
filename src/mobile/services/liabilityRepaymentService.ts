import { Decimal } from "@prisma/client/runtime/library";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import {
  LIABILITY_CLASS,
  LIABILITY_CURRENT_PORTION_MONTHS,
  LIABILITY_INTEREST_CALC_METHODS,
  LIABILITY_INTEREST_RATE_TYPES,
  LIABILITY_PAYMENT_STATUSES,
  LIABILITY_REPAYMENT_FREQUENCIES,
  LIABILITY_REPAYMENT_STATUSES,
  LIABILITY_REPAYMENT_STRUCTURES,
  LIABILITY_REPAYMENT_TYPES,
  LIABILITY_TYPE_LABELS,
  LIABILITY_TYPES,
  REPAYMENT_EXCEEDS_OUTSTANDING_BALANCE,
  type LiabilityInterestCalcMethod,
  type LiabilityInterestRateType,
  type LiabilityPaymentSource,
  type LiabilityRepaymentFrequency,
  type LiabilityRepaymentStructure,
  type LiabilityType,
  isValidInterestCalcMethod,
  isValidInterestRateType,
  isValidLiabilityPaymentSource,
  isValidLiabilityType,
  isValidRepaymentFrequency,
  isValidRepaymentStructure,
} from "../../constants/liabilityRegister";
import { SALE_STATUS } from "../../constants/salePaymentRules";
import { HttpReplyError } from "../../utils/httpReplyError";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LIAB_COUNTER = "liability_code";
const REPAY_COUNTER = "liability_repayment_code";

type ScheduleRow = {
  id: string;
  dueDate: Date;
  amountDue: Decimal;
  amountPaid: Decimal;
  status: string;
};

type LiabilityRow = {
  id: string;
  liabilityCode: string;
  name: string;
  liabilityType: string;
  creditor: string;
  originalAmount: Decimal;
  outstandingPrincipal: Decimal;
  accruedInterest: Decimal;
  interestRate: Decimal | null;
  interestRateType: string | null;
  interestCalcMethod: string | null;
  repaymentFrequency: string;
  repaymentStructure: string;
  installmentAmount: Decimal | null;
  startDate: Date;
  maturityDate: Date | null;
  nextDueDate: Date | null;
  totalPrincipalPaid: Decimal;
  totalInterestPaid: Decimal;
  totalAmountRepaid: Decimal;
  paymentStatus: string;
  repaymentCount: number;
  lastRepaymentDate: Date | null;
  evidenceUrl: string | null;
  note: string | null;
  bankName: string | null;
  loanPurpose: string | null;
  collateral: string | null;
  propertyDescription: string | null;
  propertyValue: Decimal | null;
  equipmentName: string | null;
  equipmentValue: Decimal | null;
  serialNumber: string | null;
  assetDescription: string | null;
  leasePaymentAmount: Decimal | null;
  conversionTrigger: string | null;
  conversionPrice: string | null;
  conversionDate: Date | null;
};

export type CreateLiabilityInput = {
  name: string;
  liabilityType: string;
  creditor: string;
  principalAmount: number;
  interestRate: number;
  interestRateType: string;
  interestCalculationMethod: string;
  startDate: string;
  maturityDate: string;
  repaymentFrequency: string;
  repaymentStructure: string;
  note: string;
  evidenceUrl: string;
  bankName?: string;
  loanPurpose?: string;
  collateral?: string;
  propertyDescription?: string;
  propertyValue?: number;
  equipmentName?: string;
  equipmentValue?: number;
  serialNumber?: string;
  assetDescription?: string;
  leasePaymentAmount?: number;
  conversionTrigger?: string;
  conversionPrice?: string;
  conversionDate?: string;
};

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function formatYmd(date: Date | null | undefined): string | null {
  if (!date) return null;
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateOnly(value: string, field = "date"): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new HttpReplyError(400, `${field} must be YYYY-MM-DD`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function daysBetween(from: Date, to: Date): number {
  const a = startOfUtcDay(from).getTime();
  const b = startOfUtcDay(to).getTime();
  if (b <= a) return 0;
  return Math.floor((b - a) / MS_PER_DAY);
}

function addMonths(date: Date, months: number): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()),
  );
}

async function nextCode(counterId: string, prefix: string): Promise<string> {
  const counter = await prisma.counter.upsert({
    where: { id: counterId },
    create: { id: counterId, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `${prefix}-${String(counter.lastNumber).padStart(3, "0")}`;
}

async function nextExpenseNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const counter = await tx.counter.upsert({
    where: { id: "expense_number" },
    create: { id: "expense_number", lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
  });
  return `EXP-${String(counter.lastNumber).padStart(3, "0")}`;
}

function paymentTypeFromSource(source: LiabilityPaymentSource): string {
  return source === "CASH" ? "Cash" : "Transfer";
}

function settlementBalance(liability: {
  outstandingPrincipal: Decimal;
  accruedInterest: Decimal;
}): number {
  return normalizeMoneyAmount(
    d(liability.outstandingPrincipal) + d(liability.accruedInterest),
  );
}

function periodsPerYear(frequency: string): number {
  switch (frequency) {
    case "WEEKLY":
      return 52;
    case "BIWEEKLY":
      return 26;
    case "MONTHLY":
      return 12;
    case "QUARTERLY":
      return 4;
    case "SEMI_ANNUALLY":
      return 2;
    case "ANNUALLY":
    case "ANNUAL":
      return 1;
    default:
      return 12;
  }
}

/** Convert stated rate (%) + rate type into an annual decimal fraction (e.g. 0.08). */
function toAnnualRateFraction(
  ratePercent: number,
  rateType: string | null | undefined,
): number {
  const r = ratePercent / 100;
  switch (rateType) {
    case "MONTHLY":
      return r * 12;
    case "QUARTERLY":
      return r * 4;
    case "WEEKLY":
      return r * 52;
    case "DAILY":
      return r * 365;
    case "ANNUAL":
    default:
      return r;
  }
}

function periodInterestAmount(opts: {
  originalPrincipal: number;
  outstandingPrincipal: number;
  interestRate: number | null;
  interestRateType: string | null;
  interestCalcMethod: string | null;
  repaymentFrequency: string;
}): number {
  if (opts.interestRate == null || !(opts.interestRate > 0)) return 0;
  const annual = toAnnualRateFraction(opts.interestRate, opts.interestRateType);
  const perPeriod = annual / periodsPerYear(opts.repaymentFrequency);
  const method = (opts.interestCalcMethod || "REDUCING_BALANCE") as string;
  if (method === "FLAT") {
    return normalizeMoneyAmount(opts.originalPrincipal * perPeriod);
  }
  // REDUCING_BALANCE and COMPOUNDING use outstanding principal for the period
  return normalizeMoneyAmount(opts.outstandingPrincipal * perPeriod);
}

function overdueFromSchedule(
  schedule: ScheduleRow[],
  paymentStatus: string,
  asOf = startOfUtcDay(new Date()),
): { isOverdue: boolean; daysOverdue: number; overdueAmount: number } {
  if (paymentStatus === "FULLY_PAID") {
    return { isOverdue: false, daysOverdue: 0, overdueAmount: 0 };
  }
  let overdueAmount = 0;
  let oldestDue: Date | null = null;
  for (const s of schedule) {
    if (s.status === "PAID") continue;
    const due = startOfUtcDay(s.dueDate);
    if (due.getTime() >= asOf.getTime()) continue;
    const open = Math.max(0, d(s.amountDue) - d(s.amountPaid));
    if (open <= 0) continue;
    overdueAmount += open;
    if (!oldestDue || due.getTime() < oldestDue.getTime()) oldestDue = due;
  }
  if (!oldestDue || overdueAmount <= 0) {
    return { isOverdue: false, daysOverdue: 0, overdueAmount: 0 };
  }
  return {
    isOverdue: true,
    daysOverdue: daysBetween(oldestDue, asOf),
    overdueAmount: normalizeMoneyAmount(overdueAmount),
  };
}

function nextOpenSchedule(schedule: ScheduleRow[]): ScheduleRow | null {
  const open = schedule
    .filter((s) => s.status !== "PAID")
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  return open[0] ?? null;
}

function classifyLiability(
  outstandingBalance: number,
  schedule: ScheduleRow[],
  maturityDate: Date | null,
  asOf = startOfUtcDay(new Date()),
): {
  liabilityClass: string;
  currentPortion: number;
  nonCurrentPortion: number;
} {
  if (outstandingBalance <= 0) {
    return {
      liabilityClass: LIABILITY_CLASS.NON_CURRENT,
      currentPortion: 0,
      nonCurrentPortion: 0,
    };
  }

  const horizon = addMonths(asOf, LIABILITY_CURRENT_PORTION_MONTHS);
  let currentPortion = 0;

  if (schedule.length > 0) {
    for (const s of schedule) {
      if (s.status === "PAID") continue;
      const open = Math.max(0, d(s.amountDue) - d(s.amountPaid));
      if (open <= 0) continue;
      const due = startOfUtcDay(s.dueDate);
      if (due.getTime() <= horizon.getTime()) currentPortion += open;
    }
  } else if (maturityDate) {
    const mat = startOfUtcDay(maturityDate);
    currentPortion =
      mat.getTime() <= horizon.getTime() ? outstandingBalance : 0;
  } else {
    currentPortion = 0;
  }

  currentPortion = normalizeMoneyAmount(
    Math.min(currentPortion, outstandingBalance),
  );
  const nonCurrentPortion = normalizeMoneyAmount(
    outstandingBalance - currentPortion,
  );

  let liabilityClass: string = LIABILITY_CLASS.MIXED;
  if (currentPortion <= 0) liabilityClass = LIABILITY_CLASS.NON_CURRENT;
  else if (nonCurrentPortion <= 0) liabilityClass = LIABILITY_CLASS.CURRENT;

  return { liabilityClass, currentPortion, nonCurrentPortion };
}

function generateScheduleDates(
  start: Date,
  maturity: Date,
  frequency: string,
  maxPeriods = 120,
): Date[] {
  const dates: Date[] = [];
  let cursor = startOfUtcDay(start);
  // First installment typically one period after start
  cursor = advanceByFrequency(cursor, frequency);
  const end = startOfUtcDay(maturity);

  for (let i = 0; i < maxPeriods; i++) {
    if (cursor.getTime() > end.getTime()) break;
    dates.push(new Date(cursor));
    cursor = advanceByFrequency(cursor, frequency);
  }

  if (dates.length === 0) {
    dates.push(end);
  }
  return dates;
}

function advanceByFrequency(date: Date, frequency: string): Date {
  switch (frequency) {
    case "WEEKLY":
      return new Date(date.getTime() + 7 * MS_PER_DAY);
    case "BIWEEKLY":
      return new Date(date.getTime() + 14 * MS_PER_DAY);
    case "QUARTERLY":
      return addMonths(date, 3);
    case "SEMI_ANNUALLY":
      return addMonths(date, 6);
    case "ANNUALLY":
    case "ANNUAL":
      return addMonths(date, 12);
    case "MONTHLY":
    default:
      return addMonths(date, 1);
  }
}

function buildScheduleAmounts(opts: {
  principal: number;
  dates: Date[];
  structure: string;
  interestPerPeriod: number;
}): { amountDue: number; installment: number | null }[] {
  const n = opts.dates.length;
  if (n === 0) return [];

  if (opts.structure === "BULLET") {
    return opts.dates.map((due, idx) => {
      const isLast = idx === n - 1;
      const interest = opts.interestPerPeriod;
      const principal = isLast ? opts.principal : 0;
      const amountDue = normalizeMoneyAmount(principal + interest);
      return { amountDue, installment: amountDue };
    });
  }

  if (opts.structure === "INTEREST_ONLY") {
    return opts.dates.map((_, idx) => {
      const isLast = idx === n - 1;
      const interest = opts.interestPerPeriod;
      const principal = isLast ? opts.principal : 0;
      const amountDue = normalizeMoneyAmount(principal + interest);
      return { amountDue, installment: amountDue };
    });
  }

  // AMORTIZED — equal principal + period interest
  const principalEach = normalizeMoneyAmount(opts.principal / n);
  let allocated = 0;
  return opts.dates.map((_, idx) => {
    const isLast = idx === n - 1;
    const principal = isLast
      ? normalizeMoneyAmount(opts.principal - allocated)
      : principalEach;
    allocated = normalizeMoneyAmount(allocated + principal);
    const amountDue = normalizeMoneyAmount(principal + opts.interestPerPeriod);
    return { amountDue, installment: amountDue };
  });
}

function allocateToSchedule(
  items: ScheduleRow[],
  payment: number,
  paymentDate: Date,
): {
  updates: Array<{ id: string; amountPaid: number; status: string }>;
  isOverdue: boolean;
  daysOverdue: number;
} {
  let remaining = payment;
  const updates: Array<{ id: string; amountPaid: number; status: string }> = [];
  let isOverdue = false;
  let daysOverdue = 0;
  const asOf = startOfUtcDay(paymentDate);

  const open = items
    .filter((i) => i.status !== "PAID")
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  for (const item of open) {
    if (remaining <= 0) break;
    const due = startOfUtcDay(item.dueDate);
    const openAmt = Math.max(0, d(item.amountDue) - d(item.amountPaid));
    if (openAmt <= 0) continue;
    if (due.getTime() < asOf.getTime()) {
      isOverdue = true;
      daysOverdue = Math.max(daysOverdue, daysBetween(due, asOf));
    }
    const apply = Math.min(openAmt, remaining);
    const newPaid = normalizeMoneyAmount(d(item.amountPaid) + apply);
    remaining = normalizeMoneyAmount(remaining - apply);
    updates.push({
      id: item.id,
      amountPaid: newPaid,
      status:
        newPaid >= d(item.amountDue) - 0.001
          ? "PAID"
          : newPaid > 0
            ? "PARTIAL"
            : "PENDING",
    });
  }

  return { updates, isOverdue, daysOverdue };
}

function statusBlock(l: LiabilityRow, schedule: ScheduleRow[]) {
  const overdue = overdueFromSchedule(schedule, l.paymentStatus);
  return {
    paymentStatus: l.paymentStatus,
    isOverdue: overdue.isOverdue,
    daysOverdue: overdue.daysOverdue,
  };
}

function termsBlock(l: LiabilityRow) {
  return {
    principalAmount: d(l.originalAmount),
    interestRate: l.interestRate != null ? d(l.interestRate) : null,
    interestRateType: l.interestRateType,
    interestCalculationMethod: l.interestCalcMethod,
    startDate: formatYmd(l.startDate),
    maturityDate: formatYmd(l.maturityDate),
    repaymentFrequency: l.repaymentFrequency,
    repaymentStructure: l.repaymentStructure,
  };
}

function typeSpecificFields(l: LiabilityRow): Record<string, unknown> {
  switch (l.liabilityType) {
    case "BANK_LOAN":
      return {
        bankName: l.bankName,
        loanPurpose: l.loanPurpose,
        collateral: l.collateral,
      };
    case "MORTGAGE":
      return {
        propertyDescription: l.propertyDescription,
        propertyValue: l.propertyValue != null ? d(l.propertyValue) : null,
      };
    case "EQUIPMENT_FINANCING":
      return {
        equipmentName: l.equipmentName,
        equipmentValue: l.equipmentValue != null ? d(l.equipmentValue) : null,
        serialNumber: l.serialNumber,
      };
    case "LEASE_LIABILITY":
      return {
        assetDescription: l.assetDescription,
        leasePaymentAmount:
          l.leasePaymentAmount != null ? d(l.leasePaymentAmount) : null,
      };
    case "CONVERTIBLE_LOAN":
      return {
        conversionTrigger: l.conversionTrigger,
        conversionPrice: l.conversionPrice,
        conversionDate: formatYmd(l.conversionDate),
      };
    default:
      return {};
  }
}

function listPreview(l: LiabilityRow, schedule: ScheduleRow[]) {
  const next = nextOpenSchedule(schedule);
  const overdue = overdueFromSchedule(schedule, l.paymentStatus);
  return {
    id: l.liabilityCode,
    uuid: l.id,
    name: l.name,
    liabilityType: l.liabilityType,
    creditor: l.creditor,
    originalAmount: d(l.originalAmount),
    outstandingBalance: settlementBalance(l),
    totalAmountRepaid: d(l.totalAmountRepaid),
    nextPaymentDate: formatYmd(next?.dueDate ?? l.nextDueDate),
    nextPaymentAmount: next
      ? normalizeMoneyAmount(d(next.amountDue) - d(next.amountPaid))
      : l.installmentAmount != null
        ? d(l.installmentAmount)
        : null,
    paymentStatus: l.paymentStatus,
    isOverdue: overdue.isOverdue,
    daysOverdue: overdue.daysOverdue,
  };
}

function createResponse(l: LiabilityRow, schedule: ScheduleRow[] = []) {
  return {
    id: l.liabilityCode,
    uuid: l.id,
    name: l.name,
    liabilityType: l.liabilityType,
    creditor: l.creditor,
    ...typeSpecificFields(l),
    terms: termsBlock(l),
    financialSummary: {
      outstandingBalance: settlementBalance(l),
      totalPrincipalPaid: d(l.totalPrincipalPaid),
      totalInterestPaid: d(l.totalInterestPaid),
      totalAmountRepaid: d(l.totalAmountRepaid),
    },
    status: statusBlock(l, schedule),
    repaymentSummary: {
      repaymentCount: l.repaymentCount,
      lastRepaymentDate: formatYmd(l.lastRepaymentDate),
    },
    evidence: {
      url: l.evidenceUrl,
    },
    note: l.note,
  };
}

function detailResponse(l: LiabilityRow, schedule: ScheduleRow[]) {
  const outstanding = settlementBalance(l);
  const classification = classifyLiability(
    outstanding,
    schedule,
    l.maturityDate,
  );
  const next = nextOpenSchedule(schedule);
  return {
    id: l.liabilityCode,
    uuid: l.id,
    name: l.name,
    liabilityType: l.liabilityType,
    creditor: l.creditor,
    ...typeSpecificFields(l),
    terms: termsBlock(l),
    financialSummary: {
      originalAmount: d(l.originalAmount),
      outstandingBalance: outstanding,
      totalPrincipalPaid: d(l.totalPrincipalPaid),
      totalInterestPaid: d(l.totalInterestPaid),
      totalAmountRepaid: d(l.totalAmountRepaid),
    },
    classification,
    status: statusBlock(l, schedule),
    schedule: {
      nextPaymentDate: formatYmd(next?.dueDate ?? l.nextDueDate),
      nextPaymentAmount: next
        ? normalizeMoneyAmount(d(next.amountDue) - d(next.amountPaid))
        : l.installmentAmount != null
          ? d(l.installmentAmount)
          : null,
      items: schedule.map((s) => ({
        id: s.id,
        dueDate: formatYmd(s.dueDate),
        amountDue: d(s.amountDue),
        amountPaid: d(s.amountPaid),
        outstanding: normalizeMoneyAmount(d(s.amountDue) - d(s.amountPaid)),
        status: s.status,
      })),
    },
    repaymentSummary: {
      repaymentCount: l.repaymentCount,
      lastRepaymentDate: formatYmd(l.lastRepaymentDate),
    },
    evidence: {
      url: l.evidenceUrl,
    },
    note: l.note,
  };
}

function requireTrimmed(value: unknown, field: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new HttpReplyError(400, `${field} is required`);
  return s;
}

function parseTypeSpecific(data: CreateLiabilityInput) {
  const type = data.liabilityType;
  const out: {
    bankName: string | null;
    loanPurpose: string | null;
    collateral: string | null;
    propertyDescription: string | null;
    propertyValue: number | null;
    equipmentName: string | null;
    equipmentValue: number | null;
    serialNumber: string | null;
    assetDescription: string | null;
    leasePaymentAmount: number | null;
    conversionTrigger: string | null;
    conversionPrice: string | null;
    conversionDate: Date | null;
  } = {
    bankName: null,
    loanPurpose: null,
    collateral: null,
    propertyDescription: null,
    propertyValue: null,
    equipmentName: null,
    equipmentValue: null,
    serialNumber: null,
    assetDescription: null,
    leasePaymentAmount: null,
    conversionTrigger: null,
    conversionPrice: null,
    conversionDate: null,
  };

  if (type === "BANK_LOAN") {
    out.bankName = requireTrimmed(data.bankName, "bankName");
    out.loanPurpose = requireTrimmed(data.loanPurpose, "loanPurpose");
    out.collateral = requireTrimmed(data.collateral, "collateral");
  }
  if (type === "MORTGAGE") {
    out.propertyDescription = requireTrimmed(
      data.propertyDescription,
      "propertyDescription",
    );
    const v = normalizeMoneyAmount(Number(data.propertyValue));
    if (!(v > 0)) throw new HttpReplyError(400, "propertyValue must be greater than 0");
    out.propertyValue = v;
  }
  if (type === "EQUIPMENT_FINANCING") {
    out.equipmentName = requireTrimmed(data.equipmentName, "equipmentName");
    const v = normalizeMoneyAmount(Number(data.equipmentValue));
    if (!(v > 0)) throw new HttpReplyError(400, "equipmentValue must be greater than 0");
    out.equipmentValue = v;
    out.serialNumber = data.serialNumber?.trim() || null;
  }
  if (type === "LEASE_LIABILITY") {
    out.assetDescription = requireTrimmed(data.assetDescription, "assetDescription");
    const v = normalizeMoneyAmount(Number(data.leasePaymentAmount));
    if (!(v > 0)) {
      throw new HttpReplyError(400, "leasePaymentAmount must be greater than 0");
    }
    out.leasePaymentAmount = v;
  }
  if (type === "CONVERTIBLE_LOAN") {
    out.conversionTrigger = requireTrimmed(
      data.conversionTrigger,
      "conversionTrigger",
    );
    out.conversionPrice = requireTrimmed(data.conversionPrice, "conversionPrice");
    out.conversionDate = parseDateOnly(
      requireTrimmed(data.conversionDate, "conversionDate"),
      "conversionDate",
    );
  }
  return out;
}

export const liabilityRegisterService = {
  async create(userId: string, data: CreateLiabilityInput) {
    if (!isValidLiabilityType(data.liabilityType)) {
      throw new HttpReplyError(
        400,
        `liabilityType must be one of: ${LIABILITY_TYPES.join(", ")}`,
      );
    }
    const name = data.name?.trim();
    if (!name) throw new HttpReplyError(400, "name is required");
    const creditor = data.creditor?.trim();
    if (!creditor) throw new HttpReplyError(400, "creditor is required");
    const note = data.note?.trim();
    if (!note) throw new HttpReplyError(400, "note is required");
    const evidenceUrl = data.evidenceUrl?.trim();
    if (!evidenceUrl) throw new HttpReplyError(400, "evidenceUrl is required");

    const principal = normalizeMoneyAmount(data.principalAmount);
    if (!(principal > 0)) {
      throw new HttpReplyError(400, "principalAmount must be greater than 0");
    }

    const interestRate = Number(data.interestRate);
    if (!Number.isFinite(interestRate) || interestRate < 0 || interestRate > 100) {
      throw new HttpReplyError(400, "interestRate must be between 0 and 100");
    }
    if (!isValidInterestRateType(data.interestRateType)) {
      throw new HttpReplyError(
        400,
        `interestRateType must be one of: ${LIABILITY_INTEREST_RATE_TYPES.join(", ")}`,
      );
    }
    if (!isValidInterestCalcMethod(data.interestCalculationMethod)) {
      throw new HttpReplyError(
        400,
        `interestCalculationMethod must be one of: ${LIABILITY_INTEREST_CALC_METHODS.join(", ")}`,
      );
    }
    if (!isValidRepaymentFrequency(data.repaymentFrequency)) {
      throw new HttpReplyError(
        400,
        `repaymentFrequency must be one of: ${LIABILITY_REPAYMENT_FREQUENCIES.join(", ")}`,
      );
    }
    if (!isValidRepaymentStructure(data.repaymentStructure)) {
      throw new HttpReplyError(
        400,
        `repaymentStructure must be one of: ${LIABILITY_REPAYMENT_STRUCTURES.join(", ")}`,
      );
    }

    const startDate = parseDateOnly(data.startDate, "startDate");
    const maturityDate = parseDateOnly(data.maturityDate, "maturityDate");
    if (maturityDate.getTime() < startDate.getTime()) {
      throw new HttpReplyError(400, "maturityDate must be on or after startDate");
    }

    const frequency = data.repaymentFrequency.trim() as LiabilityRepaymentFrequency;
    const structure = data.repaymentStructure.trim() as LiabilityRepaymentStructure;
    const interestRateType = data.interestRateType.trim() as LiabilityInterestRateType;
    const interestCalcMethod =
      data.interestCalculationMethod.trim() as LiabilityInterestCalcMethod;
    const typeFields = parseTypeSpecific(data);

    const interestPerPeriod = periodInterestAmount({
      originalPrincipal: principal,
      outstandingPrincipal: principal,
      interestRate,
      interestRateType,
      interestCalcMethod,
      repaymentFrequency: frequency,
    });

    const scheduleDates = generateScheduleDates(startDate, maturityDate, frequency);
    let schedulePlan = buildScheduleAmounts({
      principal,
      dates: scheduleDates,
      structure,
      interestPerPeriod,
    });
    if (
      data.liabilityType === "LEASE_LIABILITY" &&
      typeFields.leasePaymentAmount != null
    ) {
      schedulePlan = scheduleDates.map(() => ({
        amountDue: typeFields.leasePaymentAmount!,
        installment: typeFields.leasePaymentAmount,
      }));
    }
    const installment =
      schedulePlan.length > 0 ? schedulePlan[0]!.installment : null;

    const liabilityCode = await nextCode(LIAB_COUNTER, "LIAB");

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.registeredLiability.create({
        data: {
          userId,
          liabilityCode,
          name,
          liabilityType: data.liabilityType,
          creditor,
          originalAmount: new Decimal(principal),
          outstandingPrincipal: new Decimal(principal),
          accruedInterest: new Decimal(0),
          interestRate: new Decimal(interestRate),
          interestRateType,
          interestCalcMethod,
          repaymentFrequency: frequency,
          repaymentStructure: structure,
          installmentAmount:
            installment != null ? new Decimal(installment) : null,
          startDate,
          maturityDate,
          nextDueDate: scheduleDates[0] ?? maturityDate,
          evidenceUrl,
          note,
          paymentStatus: LIABILITY_PAYMENT_STATUSES[0],
          bankName: typeFields.bankName,
          loanPurpose: typeFields.loanPurpose,
          collateral: typeFields.collateral,
          propertyDescription: typeFields.propertyDescription,
          propertyValue:
            typeFields.propertyValue != null
              ? new Decimal(typeFields.propertyValue)
              : null,
          equipmentName: typeFields.equipmentName,
          equipmentValue:
            typeFields.equipmentValue != null
              ? new Decimal(typeFields.equipmentValue)
              : null,
          serialNumber: typeFields.serialNumber,
          assetDescription: typeFields.assetDescription,
          leasePaymentAmount:
            typeFields.leasePaymentAmount != null
              ? new Decimal(typeFields.leasePaymentAmount)
              : null,
          conversionTrigger: typeFields.conversionTrigger,
          conversionPrice: typeFields.conversionPrice,
          conversionDate: typeFields.conversionDate,
        },
      });

      if (schedulePlan.length > 0) {
        await tx.liabilityScheduleItem.createMany({
          data: schedulePlan.map((plan, idx) => ({
            liabilityId: row.id,
            dueDate: scheduleDates[idx]!,
            amountDue: new Decimal(plan.amountDue),
            amountPaid: new Decimal(0),
            status: "PENDING",
          })),
        });
      }

      return row;
    });

    const schedule = await prisma.liabilityScheduleItem.findMany({
      where: { liabilityId: created.id },
      orderBy: { dueDate: "asc" },
    });

    return createResponse(created, schedule);
  },

  async list(
    userId: string,
    opts?: { page?: number; limit?: number },
  ) {
    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));

    const [total, rows] = await Promise.all([
      prisma.registeredLiability.count({ where: { userId } }),
      prisma.registeredLiability.findMany({
        where: { userId },
        include: { schedule: { orderBy: { dueDate: "asc" } } },
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    // Summary over all liabilities (not just page)
    const all = await prisma.registeredLiability.findMany({
      where: { userId },
      include: { schedule: true },
    });

    let totalOutstanding = 0;
    let currentLiabilities = 0;
    let nonCurrentLiabilities = 0;
    let totalOverdue = 0;

    for (const r of all) {
      const outstanding = settlementBalance(r);
      totalOutstanding += outstanding;
      const cls = classifyLiability(outstanding, r.schedule, r.maturityDate);
      currentLiabilities += cls.currentPortion;
      nonCurrentLiabilities += cls.nonCurrentPortion;
      totalOverdue += overdueFromSchedule(r.schedule, r.paymentStatus)
        .overdueAmount;
    }

    totalOutstanding = normalizeMoneyAmount(totalOutstanding);
    currentLiabilities = normalizeMoneyAmount(currentLiabilities);
    nonCurrentLiabilities = normalizeMoneyAmount(nonCurrentLiabilities);
    totalOverdue = normalizeMoneyAmount(totalOverdue);

    return {
      summary: {
        totalLiabilities: totalOutstanding,
        currentLiabilities,
        nonCurrentLiabilities,
        totalOutstanding,
        totalOverdue,
      },
      liabilities: rows.map((r) => listPreview(r, r.schedule)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  },

  async getById(userId: string, liabilityIdOrCode: string) {
    const row = await prisma.registeredLiability.findFirst({
      where: {
        userId,
        OR: [{ id: liabilityIdOrCode }, { liabilityCode: liabilityIdOrCode }],
      },
      include: {
        schedule: { orderBy: { dueDate: "asc" } },
      },
    });
    if (!row) throw new HttpReplyError(404, "Registered liability not found");
    return detailResponse(row, row.schedule);
  },

  /** Outstanding principal by Financial Position category label. */
  async totalsByDisplayCategory(userId: string): Promise<Map<string, number>> {
    const rows = await prisma.registeredLiability.findMany({
      where: {
        userId,
        paymentStatus: { not: "FULLY_PAID" },
      },
      select: { liabilityType: true, outstandingPrincipal: true },
    });
    const map = new Map<string, number>();
    for (const label of Object.values(LIABILITY_TYPE_LABELS)) {
      map.set(label, 0);
    }
    for (const r of rows) {
      const type =
        r.liabilityType === "OTHER_LONG_TERM_BORROWING"
          ? "OTHER_LONG_TERM_BORROWINGS"
          : r.liabilityType;
      const label = LIABILITY_TYPE_LABELS[type as LiabilityType] ?? null;
      if (!label) continue;
      map.set(
        label,
        normalizeMoneyAmount((map.get(label) ?? 0) + d(r.outstandingPrincipal)),
      );
    }
    return map;
  },
};

function mapHistoryType(stored: string): string {
  if (stored === "FULL" || stored === "FULL_REPAYMENT") return "FULL_REPAYMENT";
  return "PARTIAL_REPAYMENT";
}

function mapHistoryStatus(stored: string): string {
  if ((LIABILITY_REPAYMENT_STATUSES as readonly string[]).includes(stored)) {
    return stored;
  }
  if (stored === "PARTIALLY_PAID" || stored === "FULLY_PAID") return "COMPLETED";
  return "COMPLETED";
}

function historyItem(row: {
  repaymentCode: string;
  repaymentType: string;
  repaymentAmount: Decimal;
  principalAmount: Decimal;
  interestAmount: Decimal;
  paymentDate: Date;
  paymentSource: string;
  balanceBeforeRepayment: Decimal;
  balanceAfterRepayment: Decimal;
  paymentStatus: string;
  liability: { liabilityCode: string; name: string; liabilityType: string };
}) {
  return {
    id: row.repaymentCode,
    liabilityId: row.liability.liabilityCode,
    liabilityName: row.liability.name,
    liabilityType: row.liability.liabilityType,
    amount: d(row.repaymentAmount),
    principal: d(row.principalAmount),
    interest: d(row.interestAmount),
    paymentDate: formatYmd(row.paymentDate),
    paymentSource: row.paymentSource,
    balanceBeforePayment: d(row.balanceBeforeRepayment),
    balanceAfterPayment: d(row.balanceAfterRepayment),
    status: mapHistoryStatus(row.paymentStatus),
    type: mapHistoryType(row.repaymentType),
  };
}

export const liabilityRepaymentService = {
  async create(
    userId: string,
    data: {
      liabilityId: string;
      amount: number;
      paymentDate: string;
      paymentSource: string;
      evidenceUrl?: string;
    },
  ) {
    const liabilityIdOrCode = data.liabilityId?.trim();
    if (!liabilityIdOrCode) {
      throw new HttpReplyError(400, "liabilityId is required");
    }
    const amount = normalizeMoneyAmount(data.amount);
    if (!(amount > 0)) {
      throw new HttpReplyError(400, "amount must be greater than 0");
    }
    if (!isValidLiabilityPaymentSource(data.paymentSource)) {
      throw new HttpReplyError(400, "paymentSource must be CASH or BANK");
    }
    const paymentSource = data.paymentSource as LiabilityPaymentSource;
    const paymentDate = parseDateOnly(data.paymentDate, "paymentDate");

    const liability = await prisma.registeredLiability.findFirst({
      where: {
        userId,
        OR: [{ id: liabilityIdOrCode }, { liabilityCode: liabilityIdOrCode }],
      },
      include: { schedule: { orderBy: { dueDate: "asc" } } },
    });
    if (!liability) throw new HttpReplyError(404, "Registered liability not found");
    if (liability.paymentStatus === "FULLY_PAID") {
      throw new HttpReplyError(
        400,
        "Liability is already fully settled. Use a correction/reversal process if needed.",
      );
    }

    const calculatedInterest = periodInterestAmount({
      originalPrincipal: d(liability.originalAmount),
      outstandingPrincipal: d(liability.outstandingPrincipal),
      interestRate: liability.interestRate != null ? d(liability.interestRate) : null,
      interestRateType: liability.interestRateType,
      interestCalcMethod: liability.interestCalcMethod,
      repaymentFrequency: liability.repaymentFrequency,
    });
    const accrued = Math.max(d(liability.accruedInterest), calculatedInterest);

    const outstandingPrincipal = d(liability.outstandingPrincipal);
    const outstandingBalance = outstandingPrincipal;
    const maxSettlement = normalizeMoneyAmount(outstandingPrincipal + accrued);
    if (amount > maxSettlement + 0.001) {
      throw new HttpReplyError(
        400,
        "Repayment amount exceeds the outstanding liability balance.",
        {
          requestedAmount: amount,
          outstandingBalance,
        },
        REPAYMENT_EXCEEDS_OUTSTANDING_BALANCE,
      );
    }

    const interestAmount = normalizeMoneyAmount(Math.min(accrued, amount));
    const principalAmount = normalizeMoneyAmount(amount - interestAmount);
    /** History spec: balance is principal; interest does not reduce it. */
    const balanceBeforePayment = outstandingPrincipal;
    const balanceAfterPayment = normalizeMoneyAmount(
      Math.max(0, outstandingPrincipal - principalAmount),
    );
    const repaymentType =
      balanceAfterPayment <= 0.001
        ? "FULL_REPAYMENT"
        : ("PARTIAL_REPAYMENT" as const);
    const liabilityStatus =
      balanceAfterPayment <= 0.001 ? "FULLY_PAID" : "PARTIALLY_PAID";

    const scheduleAlloc = allocateToSchedule(
      liability.schedule,
      amount,
      paymentDate,
    );

    const repaymentCode = await nextCode(REPAY_COUNTER, "REP");
    const expensePaymentType = paymentTypeFromSource(paymentSource);

    const result = await prisma.$transaction(async (tx) => {
      let interestExpenseId: string | null = null;
      let principalExpenseId: string | null = null;

      if (interestAmount > 0) {
        const expenseNumber = await nextExpenseNumber(tx);
        const exp = await tx.expense.create({
          data: {
            userId,
            createdById: userId,
            expenseNumber,
            description: `Interest expense — ${liability.name} (${repaymentCode})`,
            category: "Other",
            expenseType: "OPEX",
            amount: new Decimal(interestAmount),
            totalAmount: new Decimal(interestAmount),
            vatInclusive: false,
            paymentType: expensePaymentType,
            expenseDate: paymentDate,
            status: SALE_STATUS.PAID,
            receiptUrl: data.evidenceUrl?.trim() || null,
          },
        });
        interestExpenseId = exp.id;
      }

      if (principalAmount > 0) {
        const expenseNumber = await nextExpenseNumber(tx);
        const exp = await tx.expense.create({
          data: {
            userId,
            createdById: userId,
            expenseNumber,
            description: `Loan principal repayment — ${liability.name} (${repaymentCode})`,
            category: "Other",
            expenseType: "OPEX",
            amount: new Decimal(principalAmount),
            totalAmount: new Decimal(principalAmount),
            vatInclusive: false,
            paymentType: expensePaymentType,
            expenseDate: paymentDate,
            status: SALE_STATUS.PAID,
            receiptUrl: data.evidenceUrl?.trim() || null,
          },
        });
        principalExpenseId = exp.id;
      }

      for (const u of scheduleAlloc.updates) {
        await tx.liabilityScheduleItem.update({
          where: { id: u.id },
          data: {
            amountPaid: new Decimal(u.amountPaid),
            status: u.status,
          },
        });
      }

      const remainingSchedule = await tx.liabilityScheduleItem.findMany({
        where: {
          liabilityId: liability.id,
          status: { in: ["PENDING", "PARTIAL"] },
        },
        orderBy: { dueDate: "asc" },
        take: 1,
      });
      const nextOpen = remainingSchedule[0] ?? null;

      const newPrincipal = normalizeMoneyAmount(
        Math.max(0, d(liability.outstandingPrincipal) - principalAmount),
      );
      const newAccrued = normalizeMoneyAmount(
        Math.max(0, accrued - interestAmount),
      );

      await tx.registeredLiability.update({
        where: { id: liability.id },
        data: {
          outstandingPrincipal: new Decimal(newPrincipal),
          accruedInterest: new Decimal(newAccrued),
          totalPrincipalPaid: new Decimal(
            normalizeMoneyAmount(d(liability.totalPrincipalPaid) + principalAmount),
          ),
          totalInterestPaid: new Decimal(
            normalizeMoneyAmount(d(liability.totalInterestPaid) + interestAmount),
          ),
          totalAmountRepaid: new Decimal(
            normalizeMoneyAmount(d(liability.totalAmountRepaid) + amount),
          ),
          paymentStatus: liabilityStatus,
          repaymentCount: { increment: 1 },
          lastRepaymentDate: paymentDate,
          nextDueDate: nextOpen?.dueDate ?? liability.maturityDate,
        },
      });

      const repayment = await tx.liabilityRepayment.create({
        data: {
          userId,
          liabilityId: liability.id,
          repaymentCode,
          repaymentType,
          repaymentAmount: new Decimal(amount),
          principalAmount: new Decimal(principalAmount),
          interestAmount: new Decimal(interestAmount),
          paymentDate,
          paymentSource,
          balanceBeforeRepayment: new Decimal(balanceBeforePayment),
          balanceAfterRepayment: new Decimal(balanceAfterPayment),
          paymentStatus: "COMPLETED",
          isOverdue: scheduleAlloc.isOverdue,
          daysOverdue: scheduleAlloc.daysOverdue,
          evidenceUrl: data.evidenceUrl?.trim() || null,
          interestExpenseId,
          principalExpenseId,
        },
      });

      return repayment;
    });

    const updatedSchedule = liability.schedule.map((s) => {
      const u = scheduleAlloc.updates.find((x) => x.id === s.id);
      return u
        ? { ...s, amountPaid: new Decimal(u.amountPaid), status: u.status }
        : s;
    });
    const overdue = overdueFromSchedule(updatedSchedule, liabilityStatus);

    return {
      ...historyItem({
        ...result,
        liability: {
          liabilityCode: liability.liabilityCode,
          name: liability.name,
          liabilityType: liability.liabilityType,
        },
      }),
      liabilityStatus,
      ...(overdue.isOverdue
        ? {
            overdue: {
              isOverdue: true,
              daysOverdue: overdue.daysOverdue,
              overdueAmount: overdue.overdueAmount,
            },
          }
        : {}),
    };
  },

  async listForLiability(
    userId: string,
    liabilityIdOrCode: string,
    opts?: {
      page?: number;
      limit?: number;
      dateFrom?: string;
      dateTo?: string;
      status?: string;
      paymentSource?: string;
      type?: string;
    },
  ) {
    const liability = await prisma.registeredLiability.findFirst({
      where: {
        userId,
        OR: [{ id: liabilityIdOrCode }, { liabilityCode: liabilityIdOrCode }],
      },
      include: { schedule: true },
    });
    if (!liability) throw new HttpReplyError(404, "Registered liability not found");

    const page = Math.max(1, opts?.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts?.limit ?? 20));

    const where: Prisma.LiabilityRepaymentWhereInput = {
      userId,
      liabilityId: liability.id,
    };
    if (opts?.dateFrom || opts?.dateTo) {
      where.paymentDate = {};
      if (opts.dateFrom) {
        where.paymentDate.gte = parseDateOnly(opts.dateFrom, "dateFrom");
      }
      if (opts.dateTo) {
        where.paymentDate.lte = parseDateOnly(opts.dateTo, "dateTo");
      }
    }
    if (opts?.paymentSource) {
      if (!isValidLiabilityPaymentSource(opts.paymentSource)) {
        throw new HttpReplyError(400, "paymentSource must be CASH or BANK");
      }
      where.paymentSource = opts.paymentSource;
    }
    if (opts?.status) {
      const status = opts.status.trim();
      if (!(LIABILITY_REPAYMENT_STATUSES as readonly string[]).includes(status)) {
        throw new HttpReplyError(
          400,
          `status must be one of: ${LIABILITY_REPAYMENT_STATUSES.join(", ")}`,
        );
      }
      where.paymentStatus = status;
    }
    if (opts?.type) {
      const type = mapHistoryType(opts.type.trim());
      if (!(LIABILITY_REPAYMENT_TYPES as readonly string[]).includes(type)) {
        throw new HttpReplyError(
          400,
          `type must be one of: ${LIABILITY_REPAYMENT_TYPES.join(", ")}`,
        );
      }
      where.repaymentType = { in: [type, type === "FULL_REPAYMENT" ? "FULL" : "PARTIAL"] };
    }

    const completedWhere: Prisma.LiabilityRepaymentWhereInput = {
      userId,
      liabilityId: liability.id,
      paymentStatus: { in: ["COMPLETED", "PARTIALLY_PAID", "FULLY_PAID"] },
    };

    const [total, rows, completedAgg, lastCompleted] = await Promise.all([
      prisma.liabilityRepayment.count({ where }),
      prisma.liabilityRepayment.findMany({
        where,
        include: {
          liability: {
            select: {
              liabilityCode: true,
              name: true,
              liabilityType: true,
            },
          },
        },
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.liabilityRepayment.aggregate({
        where: completedWhere,
        _count: { _all: true },
        _sum: {
          repaymentAmount: true,
          principalAmount: true,
          interestAmount: true,
        },
      }),
      prisma.liabilityRepayment.findFirst({
        where: completedWhere,
        orderBy: [{ paymentDate: "desc" }, { createdAt: "desc" }],
        select: { paymentDate: true },
      }),
    ]);

    const overdue = overdueFromSchedule(liability.schedule, liability.paymentStatus);

    return {
      liability: {
        id: liability.liabilityCode,
        name: liability.name,
        type: liability.liabilityType,
        outstandingBalance: d(liability.outstandingPrincipal),
      },
      summary: {
        totalRepayments: completedAgg._count._all,
        totalAmountPaid: normalizeMoneyAmount(d(completedAgg._sum.repaymentAmount)),
        totalPrincipalPaid: normalizeMoneyAmount(d(completedAgg._sum.principalAmount)),
        totalInterestPaid: normalizeMoneyAmount(d(completedAgg._sum.interestAmount)),
        lastPaymentDate: formatYmd(lastCompleted?.paymentDate ?? liability.lastRepaymentDate),
      },
      repayments: rows.map(historyItem),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      ...(overdue.isOverdue
        ? {
            overdue: {
              isOverdue: true,
              daysOverdue: overdue.daysOverdue,
              overdueAmount: overdue.overdueAmount,
            },
          }
        : {}),
    };
  },
};
