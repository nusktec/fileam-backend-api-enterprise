import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../../config/database";
import { CIT_PERIOD_MONTH, type CitComputationSnapshot } from "../../constants/citFiling";
import { PIT_PERIOD_MONTH } from "../../constants/pitFiling";
import { normalizeMoneyAmount } from "../../utils/monetaryAmount";

function d(v: Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

export type CitPriorYearCarry = {
  unutilizedCapitalAllowances: number;
  unrelievedLoss: number;
  unutilizedWhtCredits: number;
  fromPeriodYear: number;
};

export type VatPriorMonthCredit = {
  inputVatBroughtForward: number;
  fromPeriodYear: number;
  fromPeriodMonth: number;
};

/** Last submitted/paid CIT snapshot carry into the next year. */
export async function getCitPriorYearCarry(
  userId: string,
  year: number,
): Promise<CitPriorYearCarry | null> {
  const prior = await prisma.taxPayable.findFirst({
    where: {
      userId,
      taxType: "CIT",
      periodYear: year - 1,
      periodMonth: CIT_PERIOD_MONTH,
      submittedAt: { not: null },
    },
    select: { computation: true, periodYear: true },
  });
  if (!prior?.computation || typeof prior.computation !== "object") return null;
  const snap = prior.computation as CitComputationSnapshot;
  const lossUsed = snap.lossCarryForward ?? 0;
  const assessable = snap.assessableProfit ?? 0;
  const chargeableBeforeLoss = assessable + (snap.chargeableGains ?? 0);
  const currentYearLoss =
    chargeableBeforeLoss < 0 ? Math.abs(chargeableBeforeLoss) : 0;
  const poolAfterUse = Math.max(0, currentYearLoss + lossUsed - lossUsed);
  const unrelievedLoss =
    chargeableBeforeLoss > 0
      ? Math.max(0, currentYearLoss)
      : Math.max(0, currentYearLoss);

  return {
    unutilizedCapitalAllowances: normalizeMoneyAmount(
      snap.unutilizedCapitalAllowances ?? 0,
    ),
    unrelievedLoss: normalizeMoneyAmount(unrelievedLoss),
    unutilizedWhtCredits: normalizeMoneyAmount(snap.unutilizedWhtCredits ?? 0),
    fromPeriodYear: prior.periodYear,
  };
}

/** VAT credit from prior month when netVatPayable was negative. */
export async function getVatInputBroughtForward(
  userId: string,
  year: number,
  month: number,
): Promise<VatPriorMonthCredit> {
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }

  const prior = await prisma.taxPayable.findFirst({
    where: {
      userId,
      taxType: "VAT",
      periodYear: prevYear,
      periodMonth: prevMonth,
      submittedAt: { not: null },
    },
    select: { computation: true, totalPayable: true },
  });

  if (!prior) {
    return { inputVatBroughtForward: 0, fromPeriodYear: prevYear, fromPeriodMonth: prevMonth };
  }

  const comp = prior.computation as { netVatPayable?: number } | null;
  const net =
    comp?.netVatPayable != null
      ? Number(comp.netVatPayable)
      : d(prior.totalPayable);
  if (net >= 0) {
    return { inputVatBroughtForward: 0, fromPeriodYear: prevYear, fromPeriodMonth: prevMonth };
  }

  return {
    inputVatBroughtForward: normalizeMoneyAmount(Math.abs(net)),
    fromPeriodYear: prevYear,
    fromPeriodMonth: prevMonth,
  };
}

export async function copyCarryForwardOnSubmit(
  userId: string,
  taxType: string,
  periodYear: number,
  periodMonth: number,
  computation: Record<string, unknown>,
): Promise<void> {
  const tt = taxType.trim().toUpperCase();
  if (tt === "CIT" && periodMonth === CIT_PERIOD_MONTH) {
    const next = await prisma.taxPayable.findUnique({
      where: {
        userId_taxType_periodYear_periodMonth: {
          userId,
          taxType: "CIT",
          periodYear: periodYear + 1,
          periodMonth: CIT_PERIOD_MONTH,
        },
      },
    });
    if (next?.submittedAt) return;
    const carry: CitPriorYearCarry = {
      unutilizedCapitalAllowances: normalizeMoneyAmount(
        Number(computation.unutilizedCapitalAllowances ?? 0),
      ),
      unrelievedLoss: normalizeMoneyAmount(
        Number(computation.unrelievedLoss ?? computation.lossCarryForward ?? 0),
      ),
      unutilizedWhtCredits: normalizeMoneyAmount(
        Number(computation.unutilizedWhtCredits ?? 0),
      ),
      fromPeriodYear: periodYear,
    };
    if (next) {
      await prisma.taxPayable.update({
        where: { id: next.id },
        data: { priorPeriodCarry: carry },
      });
    }
  }

  if (tt === "PIT" && periodMonth === PIT_PERIOD_MONTH) {
    // PIT does not auto-copy reliefs; no cross-year carry required.
  }
}
