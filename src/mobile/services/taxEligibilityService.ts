import { prisma } from "../../config/database";
import { ASSET_ON_BOOKS_STATUSES } from "../../constants/assets";
import { buildTaxPersonaGuidancePayload } from "../../constants/taxPersona";
import {
  blendEligibilityFixedAssets,
  blendEligibilityTurnover,
  computeTaxEligibility,
  normalizePrimaryBusinessActivity,
  normalizeProvidesProfessionalServices,
  providesProfessionalServicesAnswerToBoolean,
  resolveProvidesProfessionalServices,
  type ProvidesProfessionalServicesAnswer,
  type PrimaryBusinessActivity,
  type TaxEligibilityResult,
} from "../../constants/taxEligibility";
import { businessProfileMoneyToNumber } from "../../constants/businessProfile";

function decimalToNumber(
  d: { toNumber?: () => number } | number | null | undefined,
): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  if (typeof d.toNumber === "function") return d.toNumber();
  return Number(d);
}

async function getBooksAnnualTurnover(userId: string): Promise<number | null> {
  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const agg = await prisma.sale.aggregate({
    where: { userId, saleDate: { gte: yearStart } },
    _sum: { totalAmount: true },
  });
  const ytd = decimalToNumber(agg._sum.totalAmount);
  if (ytd <= 0) return null;
  const monthsElapsed = now.getUTCMonth() + 1;
  return (ytd / monthsElapsed) * 12;
}

async function getBooksFixedAssets(userId: string): Promise<number | null> {
  const rows = await prisma.asset.findMany({
    where: { userId, status: { in: [...ASSET_ON_BOOKS_STATUSES] } },
    select: { purchaseCost: true },
  });
  const total = rows.reduce((s, r) => s + decimalToNumber(r.purchaseCost), 0);
  return total > 0 ? total : null;
}

export type TaxEligibilityProfilePayload = {
  professionalService: boolean | null;
  providesProfessionalServices: ProvidesProfessionalServicesAnswer | null;
  primaryBusinessActivity: PrimaryBusinessActivity | null;
  annualGrossTurnover: number | null;
  totalFixedAssets: number | null;
  taxEligibility: TaxEligibilityResult;
};

export async function buildTaxEligibilityProfileForUser(
  userId: string,
): Promise<TaxEligibilityProfilePayload | null> {
  const [business, user, booksTurnover, booksFixedAssets] = await Promise.all([
    prisma.business.findFirst({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { taxPersona: true, solopreneurRegistration: true },
    }),
    getBooksAnnualTurnover(userId),
    getBooksFixedAssets(userId),
  ]);

  if (!business) return null;

  const profileTurnover = businessProfileMoneyToNumber(
    business.annualGrossTurnover,
  );
  const profileFixedAssets = businessProfileMoneyToNumber(
    business.totalFixedAssets,
  );
  const turnoverBlend = blendEligibilityTurnover(profileTurnover, booksTurnover);
  const assetsBlend = blendEligibilityFixedAssets(
    profileFixedAssets,
    booksFixedAssets,
  );

  const providesAnswer = normalizeProvidesProfessionalServices(
    business.providesProfessionalServices,
  );
  const primaryActivity = normalizePrimaryBusinessActivity(
    business.primaryBusinessActivity,
  );

  const professional = resolveProvidesProfessionalServices({
    providesProfessionalServices: providesAnswer,
    primaryBusinessActivity: primaryActivity,
    businessType: business.businessType,
    sector: business.sector,
  });

  const guidance = buildTaxPersonaGuidancePayload(
    user?.taxPersona ?? null,
    user?.solopreneurRegistration ?? null,
  );

  const taxEligibility = computeTaxEligibility({
    annualGrossTurnover: turnoverBlend.value,
    totalFixedAssets: assetsBlend.value,
    providesProfessionalServices: professional,
    citApplicable: guidance.applicableTaxes.cit,
    turnoverSource: turnoverBlend.source,
    fixedAssetsSource: assetsBlend.source,
  });

  return {
    professionalService: providesProfessionalServicesAnswerToBoolean(
      providesAnswer,
    ),
    providesProfessionalServices: providesAnswer,
    primaryBusinessActivity: primaryActivity,
    annualGrossTurnover: profileTurnover,
    totalFixedAssets: profileFixedAssets,
    taxEligibility,
  };
}
