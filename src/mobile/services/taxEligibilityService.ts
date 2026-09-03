import { prisma } from "../../config/database";
import { buildTaxPersonaGuidancePayload } from "../../constants/taxPersona";
import {
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
import { resolveCitClassificationInputsForUser } from "./citClassificationInputsService";

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
  const [business, user, classificationInputs] = await Promise.all([
    prisma.business.findFirst({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { taxPersona: true, solopreneurRegistration: true },
    }),
    resolveCitClassificationInputsForUser(userId),
  ]);

  if (!business || !classificationInputs) return null;

  const profileTurnover = businessProfileMoneyToNumber(
    business.annualGrossTurnover,
  );
  const profileFixedAssets = businessProfileMoneyToNumber(
    business.totalFixedAssets,
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
    annualGrossTurnover: classificationInputs.turnover,
    totalFixedAssets: classificationInputs.fixedAssets,
    providesProfessionalServices: professional,
    citApplicable: guidance.applicableTaxes.cit,
    turnoverSource: classificationInputs.turnoverSource,
    fixedAssetsSource: classificationInputs.fixedAssetsSource,
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
