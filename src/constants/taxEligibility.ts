/**
 * Tax Eligibility Profile — NTA / NTAA 2025 small-company (CIT) and small-business (VAT) tests.
 * CIT: turnover ≤ ₦100m AND fixed assets ≤ ₦250m AND not professional services.
 * VAT: turnover ≤ ₦100m AND fixed assets < ₦250m AND not professional services.
 */

import {
  CIT_FIXED_ASSETS_THRESHOLD_NGN,
  CIT_TURNOVER_THRESHOLD_NGN,
  CIT_RATE_SMALL_COMPANY_PERCENT,
  VAT_TURNOVER_THRESHOLD_NGN,
} from "./percentages";
import { isProfessionalServicesBusiness } from "./citFiling";

export const PROVIDES_PROFESSIONAL_SERVICES_VALUES = [
  "YES",
  "NO",
  "NOT_SURE",
] as const;

export type ProvidesProfessionalServicesAnswer =
  (typeof PROVIDES_PROFESSIONAL_SERVICES_VALUES)[number];

export const CIT_CLASSIFICATION = {
  SMALL_COMPANY: "SMALL_COMPANY",
  NON_SMALL_COMPANY: "NON_SMALL_COMPANY",
  NOT_APPLICABLE: "NOT_APPLICABLE",
} as const;

export type CitClassification =
  (typeof CIT_CLASSIFICATION)[keyof typeof CIT_CLASSIFICATION];

export const VAT_CLASSIFICATION = {
  SMALL_BUSINESS: "SMALL_BUSINESS",
  NON_SMALL_BUSINESS: "NON_SMALL_BUSINESS",
} as const;

export type VatClassification =
  (typeof VAT_CLASSIFICATION)[keyof typeof VAT_CLASSIFICATION];

/** Primary business activity slugs (stored as-is). */
export const PRIMARY_BUSINESS_ACTIVITY_VALUES = [
  "RETAIL_TRADING",
  "WHOLESALE",
  "MANUFACTURING",
  "AGRICULTURE",
  "FOOD_RESTAURANT",
  "TRANSPORTATION_LOGISTICS",
  "CONSTRUCTION",
  "TECHNOLOGY_SOFTWARE",
  "BEAUTY_PERSONAL_CARE",
  "HOSPITALITY",
  "REAL_ESTATE",
  "EDUCATION",
  "HEALTHCARE",
  "CONSULTING_ADVISORY",
  "ACCOUNTING_TAX_SERVICES",
  "LEGAL_SERVICES",
  "ENGINEERING_ARCHITECTURE",
  "OTHER_PROFESSIONAL_SERVICES",
  "OTHER",
] as const;

export type PrimaryBusinessActivity =
  (typeof PRIMARY_BUSINESS_ACTIVITY_VALUES)[number];

/** true = professional, false = not, null = depends/unknown → conservative exclusion. */
const ACTIVITY_PROFESSIONAL_MAP: Record<
  PrimaryBusinessActivity,
  boolean | null
> = {
  RETAIL_TRADING: false,
  WHOLESALE: false,
  MANUFACTURING: false,
  AGRICULTURE: false,
  FOOD_RESTAURANT: false,
  TRANSPORTATION_LOGISTICS: false,
  CONSTRUCTION: false,
  TECHNOLOGY_SOFTWARE: null,
  BEAUTY_PERSONAL_CARE: false,
  HOSPITALITY: false,
  REAL_ESTATE: null,
  EDUCATION: null,
  HEALTHCARE: null,
  CONSULTING_ADVISORY: true,
  ACCOUNTING_TAX_SERVICES: true,
  LEGAL_SERVICES: true,
  ENGINEERING_ARCHITECTURE: true,
  OTHER_PROFESSIONAL_SERVICES: true,
  OTHER: null,
};

export function normalizeProvidesProfessionalServices(
  value: unknown,
): ProvidesProfessionalServicesAnswer | null {
  if (value == null || value === "") return null;
  const v = String(value).trim().toUpperCase().replace(/\s+/g, "_");
  if (v === "YES" || v === "TRUE") return "YES";
  if (v === "NO" || v === "FALSE") return "NO";
  if (v === "NOT_SURE" || v === "UNSURE" || v === "I'M_NOT_SURE") {
    return "NOT_SURE";
  }
  return null;
}

/** Maps stored YES/NO/NOT_SURE to optional boolean for API responses. */
export function providesProfessionalServicesAnswerToBoolean(
  answer: ProvidesProfessionalServicesAnswer | null | undefined,
): boolean | null {
  if (answer === "YES") return true;
  if (answer === "NO") return false;
  return null;
}

/** Maps boolean API input to YES/NO storage. */
export function booleanToProvidesProfessionalServicesAnswer(
  value: boolean,
): ProvidesProfessionalServicesAnswer {
  return value ? "YES" : "NO";
}

export function normalizePrimaryBusinessActivity(
  value: unknown,
): PrimaryBusinessActivity | null {
  if (value == null || value === "") return null;
  const v = String(value).trim().toUpperCase().replace(/[\s/]+/g, "_");
  return (PRIMARY_BUSINESS_ACTIVITY_VALUES as readonly string[]).includes(v)
    ? (v as PrimaryBusinessActivity)
    : null;
}

/** Resolve whether the business provides professional services for eligibility tests. */
export function resolveProvidesProfessionalServices(input: {
  providesProfessionalServices?: ProvidesProfessionalServicesAnswer | null;
  primaryBusinessActivity?: PrimaryBusinessActivity | null;
  businessType?: string | null;
  sector?: string | null;
}): boolean {
  const answer = input.providesProfessionalServices;
  if (answer === "YES") return true;
  if (answer === "NO") return false;

  if (answer === "NOT_SURE" && input.primaryBusinessActivity) {
    const mapped = ACTIVITY_PROFESSIONAL_MAP[input.primaryBusinessActivity];
    if (mapped === true) return true;
    if (mapped === false) return false;
    return true;
  }

  return isProfessionalServicesBusiness(input.businessType, input.sector);
}

export type TaxEligibilityInputs = {
  annualGrossTurnover: number;
  totalFixedAssets: number;
  providesProfessionalServices: boolean;
  citApplicable?: boolean;
};

export type TaxEligibilityResult = {
  inputs: {
    annualGrossTurnover: number;
    totalFixedAssets: number;
    providesProfessionalServicesResolved: boolean;
    turnoverSource: "profile" | "books" | "blended" | "transactions";
    fixedAssetsSource: "profile" | "books" | "blended";
  };
  citClassification: CitClassification;
  vatClassification: VatClassification;
  cit: {
    eligible: boolean;
    indicativeRatePercent: number;
    statusLabel: string;
    message: string;
  };
  vat: {
    eligible: boolean;
    statusLabel: string;
    message: string;
  };
  importantNotice: string;
};

export function computeCitClassification(
  input: TaxEligibilityInputs,
): CitClassification {
  if (input.citApplicable === false) {
    return CIT_CLASSIFICATION.NOT_APPLICABLE;
  }
  const turnover = Math.max(0, input.annualGrossTurnover);
  const fixedAssets = Math.max(0, input.totalFixedAssets);
  const isSmall =
    !input.providesProfessionalServices &&
    turnover <= CIT_TURNOVER_THRESHOLD_NGN &&
    fixedAssets <= CIT_FIXED_ASSETS_THRESHOLD_NGN;
  return isSmall
    ? CIT_CLASSIFICATION.SMALL_COMPANY
    : CIT_CLASSIFICATION.NON_SMALL_COMPANY;
}

export function computeVatClassification(input: {
  annualGrossTurnover: number;
  totalFixedAssets: number;
  providesProfessionalServices: boolean;
}): VatClassification {
  const turnover = Math.max(0, input.annualGrossTurnover);
  const fixedAssets = Math.max(0, input.totalFixedAssets);
  const isSmall =
    !input.providesProfessionalServices &&
    turnover <= VAT_TURNOVER_THRESHOLD_NGN &&
    fixedAssets < CIT_FIXED_ASSETS_THRESHOLD_NGN;
  return isSmall
    ? VAT_CLASSIFICATION.SMALL_BUSINESS
    : VAT_CLASSIFICATION.NON_SMALL_BUSINESS;
}

function citMessages(
  classification: CitClassification,
  input: TaxEligibilityInputs,
): TaxEligibilityResult["cit"] {
  if (classification === CIT_CLASSIFICATION.NOT_APPLICABLE) {
    return {
      eligible: false,
      indicativeRatePercent: 0,
      statusLabel: "Not applicable",
      message:
        "Company Income Tax (CIT) does not apply to your current tax profile.",
    };
  }
  if (input.providesProfessionalServices) {
    return {
      eligible: false,
      indicativeRatePercent: 30,
      statusLabel: "Non-small company",
      message:
        "Your business provides professional services and therefore does not qualify for the small-company classification solely on the basis of turnover.",
    };
  }
  if (input.annualGrossTurnover > CIT_TURNOVER_THRESHOLD_NGN) {
    return {
      eligible: false,
      indicativeRatePercent: 30,
      statusLabel: "Non-small company",
      message: `Your current annual gross turnover is above the ₦${CIT_TURNOVER_THRESHOLD_NGN.toLocaleString("en-NG")} small-company threshold. FileAm will therefore apply the applicable CIT rules for businesses outside the small-company category.`,
    };
  }
  if (input.totalFixedAssets > CIT_FIXED_ASSETS_THRESHOLD_NGN) {
    return {
      eligible: false,
      indicativeRatePercent: 30,
      statusLabel: "Non-small company",
      message: `Your fixed assets exceed the ₦${CIT_FIXED_ASSETS_THRESHOLD_NGN.toLocaleString("en-NG")} small-company threshold.`,
    };
  }
  if (classification === CIT_CLASSIFICATION.SMALL_COMPANY) {
    return {
      eligible: true,
      indicativeRatePercent: CIT_RATE_SMALL_COMPANY_PERCENT,
      statusLabel: "Small-company status: Eligible",
      message:
        "Based on the information you've provided, your business currently appears to meet the criteria for the small-company CIT category. FileAm will continue to monitor your business activity and financial records and update your tax status when necessary.",
    };
  }
  return {
    eligible: false,
    indicativeRatePercent: 30,
    statusLabel: "Non-small company",
    message:
      "FileAm will apply the applicable CIT rules for businesses outside the small-company category.",
  };
}

function vatMessages(
  classification: VatClassification,
  providesProfessional: boolean,
): TaxEligibilityResult["vat"] {
  if (providesProfessional) {
    return {
      eligible: false,
      statusLabel: "Non-small business",
      message:
        "Your business provides professional services and therefore does not qualify for the small-business VAT classification solely on the basis of turnover.",
    };
  }
  if (classification === VAT_CLASSIFICATION.SMALL_BUSINESS) {
    return {
      eligible: true,
      statusLabel: "Small-business status: Eligible",
      message:
        "Based on the information you've provided, your business currently appears to qualify as a small business for VAT purposes. FileAm will apply the applicable small-business VAT rules to your account.",
    };
  }
  return {
    eligible: false,
    statusLabel: "Non-small business",
    message:
      "FileAm will apply the standard VAT rules for businesses outside the small-business category.",
  };
}

export function computeTaxEligibility(
  input: TaxEligibilityInputs & {
    turnoverSource?: "profile" | "books" | "blended" | "transactions";
    fixedAssetsSource?: "profile" | "books" | "blended";
  },
): TaxEligibilityResult {
  const citClassification = computeCitClassification(input);
  const vatClassification = computeVatClassification(input);

  return {
    inputs: {
      annualGrossTurnover: input.annualGrossTurnover,
      totalFixedAssets: input.totalFixedAssets,
      providesProfessionalServicesResolved: input.providesProfessionalServices,
      turnoverSource: input.turnoverSource ?? "profile",
      fixedAssetsSource: input.fixedAssetsSource ?? "profile",
    },
    citClassification,
    vatClassification,
    cit: citMessages(citClassification, input),
    vat: vatMessages(vatClassification, input.providesProfessionalServices),
    importantNotice:
      "Your tax classification is based on the information currently provided to FileAm. FileAm will continuously monitor your financial records and update your tax position when your turnover, fixed assets, business activity or other relevant circumstances change.",
  };
}

/** Blend profile estimate with books — books override upward (conservative). */
export function blendEligibilityTurnover(
  profileEstimate: number | null | undefined,
  booksAnnual: number | null | undefined,
): { value: number; source: "profile" | "books" | "blended" } {
  const profile = Math.max(0, profileEstimate ?? 0);
  const books = Math.max(0, booksAnnual ?? 0);
  if (books <= 0 && profile <= 0) return { value: 0, source: "profile" };
  if (books <= 0) return { value: profile, source: "profile" };
  if (profile <= 0) return { value: books, source: "books" };
  if (books > profile) return { value: books, source: "books" };
  if (profile > books) return { value: profile, source: "profile" };
  return { value: books, source: "blended" };
}

export function blendEligibilityFixedAssets(
  profileEstimate: number | null | undefined,
  booksTotal: number | null | undefined,
): { value: number; source: "profile" | "books" | "blended" } {
  const profile = Math.max(0, profileEstimate ?? 0);
  const books = Math.max(0, booksTotal ?? 0);
  if (books <= 0 && profile <= 0) return { value: 0, source: "profile" };
  const value = Math.max(profile, books);
  const source =
    books > 0 && profile > 0 && books !== profile
      ? "blended"
      : books >= profile && books > 0
        ? "books"
        : "profile";
  return { value, source };
}
