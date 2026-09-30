import {
  PIT_RENT_RELIEF_CAP_NGN,
  PIT_RENT_RELIEF_RATE,
} from "../../constants/pitFiling";
import type { PitDraftInputs } from "../../constants/filingWorkspace";
import {
  inclusiveDayCount,
  naira,
  overlapInclusiveDays,
} from "./taxStatementMath";
import type { TaxStatementPeriod } from "./taxStatementTypes";

function blank(value: unknown): boolean {
  return value == null || String(value).trim() === "";
}

export function isPitRentClaimComplete(reliefs: NonNullable<PitDraftInputs["reliefs"]>): boolean {
  const annualRent = Number(reliefs.annualRent ?? 0);
  if (annualRent === 0) return true;
  return !(
    blank(reliefs.landlordName) ||
    blank(reliefs.landlordContact) ||
    blank(reliefs.propertyAddress) ||
    blank(reliefs.rentPeriodStart)
  );
}

export function computeStatementRentRelief(
  draft: PitDraftInputs | null,
  period: TaxStatementPeriod,
): number {
  if (!draft?.reliefs) return 0;
  const reliefs = draft.reliefs;
  const annualRent = Number(reliefs.annualRent ?? 0);
  if (!isPitRentClaimComplete(reliefs)) return 0;
  if (annualRent <= 0) return 0;
  let eligibleRent = annualRent;
  const start = reliefs.rentPeriodStart;
  const end = reliefs.rentPeriodEnd;
  if (start && end) {
    const periodDays = inclusiveDayCount(start, end);
    const overlap = overlapInclusiveDays(
      start,
      end,
      period.periodStart,
      period.periodEnd,
    );
    eligibleRent = periodDays > 0 ? naira((annualRent * overlap) / periodDays) : 0;
  }
  return Math.min(PIT_RENT_RELIEF_CAP_NGN, naira(eligibleRent * PIT_RENT_RELIEF_RATE));
}

export function pitReliefsFromDraft(
  draft: PitDraftInputs | null,
  period: TaxStatementPeriod,
): {
  pensionOverride: number | null;
  extraPension: number;
  nhf: number;
  nhis: number;
  lifeAssurance: number;
  mortgageInterest: number;
  rentRelief: number;
  applicableReliefs: number;
} {
  if (!draft?.reliefs) {
    return {
      pensionOverride: null,
      extraPension: 0,
      nhf: 0,
      nhis: 0,
      lifeAssurance: 0,
      mortgageInterest: 0,
      rentRelief: 0,
      applicableReliefs: 0,
    };
  }
  const r = draft.reliefs;
  const nhf =
    r.nhfOverride != null ? Number(r.nhfOverride) : Number(r.nhfContribution ?? 0);
  const nhis = Number(r.nhisContribution ?? 0);
  const lifeAssurance = Number(r.lifeAssurance ?? 0);
  const mortgageInterest = Number(r.mortgageInterest ?? 0);
  const rentRelief = computeStatementRentRelief(draft, period);
  return {
    pensionOverride: r.pensionOverride == null ? null : Number(r.pensionOverride),
    extraPension: Number(r.extraPension ?? 0),
    nhf: naira(nhf),
    nhis: naira(nhis),
    lifeAssurance: naira(lifeAssurance),
    mortgageInterest: naira(mortgageInterest),
    rentRelief: naira(rentRelief),
    applicableReliefs: naira(
      nhf + nhis + lifeAssurance + mortgageInterest + rentRelief,
    ),
  };
}
