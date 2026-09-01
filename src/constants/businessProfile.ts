import { Decimal } from "@prisma/client/runtime/library";
import { HttpReplyError } from "../utils/httpReplyError";
import {
  assertMonetaryAmountInRange,
  validateMonetaryAmount,
} from "../utils/monetaryAmount";
import {
  booleanToProvidesProfessionalServicesAnswer,
  normalizePrimaryBusinessActivity,
  normalizeProvidesProfessionalServices,
  PRIMARY_BUSINESS_ACTIVITY_VALUES,
  PROVIDES_PROFESSIONAL_SERVICES_VALUES,
  type PrimaryBusinessActivity,
  type ProvidesProfessionalServicesAnswer,
} from "./taxEligibility";

/** Supported sector labels — stored exactly as provided. */
export const BUSINESS_PROFILE_SECTOR_VALUES = [
  "IT & Services",
  "Finance",
  "Healthcare",
  "Retail",
  "Manufacturing",
  "Legal",
  "Construction",
  "Education",
  "Other",
] as const;

export type BusinessProfileSector =
  (typeof BUSINESS_PROFILE_SECTOR_VALUES)[number];

/** Empty or whitespace sector → null. */
export function normalizeBusinessProfileSector(
  value: unknown,
): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

/**
 * Parse optional NGN money field when the key is present in the request.
 * Returns null to clear, number to store, or throws on invalid input.
 */
export function parseBusinessProfileMoneyField(
  value: unknown,
  fieldLabel: string,
): number | null {
  if (value === null) return null;
  if (typeof value === "string") {
    throw new HttpReplyError(
      422,
      `${fieldLabel} must be a JSON number`,
      null,
      "VALIDATION_ERROR",
    );
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new HttpReplyError(
      422,
      `${fieldLabel} must be a JSON number`,
      null,
      "VALIDATION_ERROR",
    );
  }
  const err = validateMonetaryAmount(value, fieldLabel);
  if (err) {
    throw new HttpReplyError(422, err, null, "VALIDATION_ERROR");
  }
  assertMonetaryAmountInRange(value, fieldLabel);
  return value;
}

export function decimalFromBusinessProfileMoney(
  value: number | null,
): Decimal | null {
  if (value === null) return null;
  return new Decimal(value);
}

export function businessProfileMoneyToNumber(
  value: Decimal | null | undefined,
): number | null {
  if (value == null) return null;
  return Number(value);
}

/** Extract optional LTD profile fields only when keys are present on the body. */
export function extractOptionalBusinessProfileLtdFields(
  body: Record<string, unknown>,
): {
  sector?: string | null;
  totalFixedAssets?: number | null;
  annualGrossTurnover?: number | null;
} {
  const out: {
    sector?: string | null;
    totalFixedAssets?: number | null;
    annualGrossTurnover?: number | null;
  } = {};

  if (Object.prototype.hasOwnProperty.call(body, "sector")) {
    out.sector = normalizeBusinessProfileSector(body.sector);
  }
  if (Object.prototype.hasOwnProperty.call(body, "totalFixedAssets")) {
    out.totalFixedAssets = parseBusinessProfileMoneyField(
      body.totalFixedAssets,
      "totalFixedAssets",
    );
  }
  if (Object.prototype.hasOwnProperty.call(body, "annualGrossTurnover")) {
    out.annualGrossTurnover = parseBusinessProfileMoneyField(
      body.annualGrossTurnover,
      "annualGrossTurnover",
    );
  }

  return out;
}

/** Extract tax eligibility profile fields when keys are present on the body. */
export function extractOptionalBusinessProfileTaxEligibilityFields(
  body: Record<string, unknown>,
): {
  providesProfessionalServices?: ProvidesProfessionalServicesAnswer | null;
  primaryBusinessActivity?: PrimaryBusinessActivity | null;
} {
  const out: {
    providesProfessionalServices?: ProvidesProfessionalServicesAnswer | null;
    primaryBusinessActivity?: PrimaryBusinessActivity | null;
  } = {};

  let fromBoolean: ProvidesProfessionalServicesAnswer | null | undefined;
  if (Object.prototype.hasOwnProperty.call(body, "professionalService")) {
    const raw = body.professionalService;
    if (raw === null) {
      fromBoolean = null;
    } else if (typeof raw === "boolean") {
      fromBoolean = booleanToProvidesProfessionalServicesAnswer(raw);
    } else {
      throw new HttpReplyError(
        422,
        "professionalService must be a JSON boolean or null",
        null,
        "VALIDATION_ERROR",
      );
    }
  }

  let fromEnum: ProvidesProfessionalServicesAnswer | null | undefined;
  if (Object.prototype.hasOwnProperty.call(body, "providesProfessionalServices")) {
    const raw = body.providesProfessionalServices;
    if (raw === null || raw === "") {
      fromEnum = null;
    } else {
      const normalized = normalizeProvidesProfessionalServices(raw);
      if (!normalized) {
        throw new HttpReplyError(
          422,
          `providesProfessionalServices must be one of: ${PROVIDES_PROFESSIONAL_SERVICES_VALUES.join(", ")}`,
          null,
          "VALIDATION_ERROR",
        );
      }
      fromEnum = normalized;
    }
  }

  if (fromBoolean !== undefined && fromEnum !== undefined) {
    if (fromEnum === "NOT_SURE" || fromBoolean !== fromEnum) {
      throw new HttpReplyError(
        422,
        "professionalService and providesProfessionalServices must agree (true=YES, false=NO)",
        null,
        "VALIDATION_ERROR",
      );
    }
    out.providesProfessionalServices = fromEnum;
  } else if (fromBoolean !== undefined) {
    out.providesProfessionalServices = fromBoolean;
  } else if (fromEnum !== undefined) {
    out.providesProfessionalServices = fromEnum;
  }

  if (Object.prototype.hasOwnProperty.call(body, "primaryBusinessActivity")) {
    const raw = body.primaryBusinessActivity;
    if (raw === null || raw === "") {
      out.primaryBusinessActivity = null;
    } else {
      const normalized = normalizePrimaryBusinessActivity(raw);
      if (!normalized) {
        throw new HttpReplyError(
          422,
          `primaryBusinessActivity must be one of: ${PRIMARY_BUSINESS_ACTIVITY_VALUES.join(", ")}`,
          null,
          "VALIDATION_ERROR",
        );
      }
      out.primaryBusinessActivity = normalized;
    }
  }

  const answer = out.providesProfessionalServices;
  if (
    answer === "NOT_SURE" &&
    Object.prototype.hasOwnProperty.call(body, "providesProfessionalServices") &&
    !out.primaryBusinessActivity
  ) {
    throw new HttpReplyError(
      422,
      "primaryBusinessActivity is required when providesProfessionalServices is NOT_SURE",
      null,
      "VALIDATION_ERROR",
    );
  }

  return out;
}

/** All optional business profile fields (LTD + tax eligibility). */
export function extractOptionalBusinessProfileFields(
  body: Record<string, unknown>,
): ReturnType<typeof extractOptionalBusinessProfileLtdFields> &
  ReturnType<typeof extractOptionalBusinessProfileTaxEligibilityFields> {
  return {
    ...extractOptionalBusinessProfileLtdFields(body),
    ...extractOptionalBusinessProfileTaxEligibilityFields(body),
  };
}
