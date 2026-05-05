import type {
  TaxpayerComputationContext,
  TaxpayerComputationProfileCode,
  TaxSectionPresentation,
} from "./taxpayerComputationProfile";

export const TAX_PERSONA_CODES = [
  "SOLOPRENEUR",
  "TRADER",
  "PAYEE",
  "GIG_WORKER",
  "REMOTE_WORKER",
] as const;

export type TaxPersonaCode = (typeof TAX_PERSONA_CODES)[number];

export const SOLOPRENEUR_REGISTRATION_CODES = [
  "NOT_REGISTERED",
  "BUSINESS_NAME",
  "LIMITED_COMPANY",
] as const;

export type SolopreneurRegistrationCode =
  (typeof SOLOPRENEUR_REGISTRATION_CODES)[number];

export type ApplicableTaxFlags = {
  vat: boolean;
  pit: boolean;
  wht: boolean;
  paye: boolean;
  cit: boolean;
  localGovLevies: boolean;
};

/** Nigerian-context subtitles for dashboard tax flip-cards */
export const TAX_GUIDANCE_SUBTITLE: Record<
  keyof ApplicableTaxFlags,
  { label: string; subtitle: string }
> = {
  vat: {
    label: "VAT",
    subtitle:
      "You may need to charge 7.5% on your sales when registered or above turnover thresholds.",
  },
  pit: {
    label: "Personal Income Tax",
    subtitle:
      "You must file annually on your total taxable income (including business or side income where relevant).",
  },
  wht: {
    label: "WHT (Withholding Tax)",
    subtitle:
      "You may see deductions on payments you receive or make on qualifying contracts and services.",
  },
  cit: {
    label: "Company Income Tax (CIT)",
    subtitle:
      "If your business is registered as a company, you pay tax on company profits annually.",
  },
  paye: {
    label: "PAYE",
    subtitle:
      "Salary PAYE is usually withheld by your employer; you may still owe additional taxes on other income.",
  },
  localGovLevies: {
    label: "Local Government Levies",
    subtitle:
      "You may need to pay small business or trade levies depending on your location and trade.",
  },
};

/** Tooltip shown next to persona selection during onboarding */
export const TAX_PERSONA_SELECTION_TOOLTIP: Record<TaxPersonaCode, string> = {
  SOLOPRENEUR:
    "You run your own structured business or service — registered or unregistered (e.g. agency, consultant, creator with systems). You earn from customers and manage operations.",
  TRADER:
    "You sell goods daily — shop, market, or online (e.g. clothing, food, electronics). Income comes from frequent retail sales.",
  PAYEE:
    "You are employed (salary) but may also earn side income (freelance, small business). Your employer handles PAYE; you may still need to file other taxes.",
  GIG_WORKER:
    "You earn from short-term or freelance work (ride-hailing, delivery, contracts). Income can vary month to month.",
  REMOTE_WORKER:
    "You work for foreign or remote employers and often earn in foreign currency; global income rules may still apply locally.",
};

export function normalizeTaxPersona(
  raw: string | null | undefined,
): TaxPersonaCode | null {
  if (!raw || typeof raw !== "string") return null;
  const u = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const aliases: Record<string, TaxPersonaCode> = {
    SOLOPRENEUR: "SOLOPRENEUR",
    TRADER: "TRADER",
    PAYEE: "PAYEE",
    EMPLOYEE: "PAYEE",
    GIG_WORKER: "GIG_WORKER",
    GIG: "GIG_WORKER",
    REMOTE_WORKER: "REMOTE_WORKER",
    REMOTE: "REMOTE_WORKER",
  };
  if (aliases[u]) return aliases[u];
  if ((TAX_PERSONA_CODES as readonly string[]).includes(u))
    return u as TaxPersonaCode;
  return null;
}

export function normalizeSolopreneurRegistration(
  raw: string | null | undefined,
): SolopreneurRegistrationCode | null {
  if (!raw || typeof raw !== "string") return null;
  const u = raw.trim().toUpperCase().replace(/[\s-]+/g, "_");
  const map: Record<string, SolopreneurRegistrationCode> = {
    NOT_REGISTERED: "NOT_REGISTERED",
    UNREGISTERED: "NOT_REGISTERED",
    NONE: "NOT_REGISTERED",
    BUSINESS_NAME: "BUSINESS_NAME",
    BN: "BUSINESS_NAME",
    BUSINESSNAME: "BUSINESS_NAME",
    LIMITED_COMPANY: "LIMITED_COMPANY",
    LTD: "LIMITED_COMPANY",
    LIMITED: "LIMITED_COMPANY",
    COMPANY: "LIMITED_COMPANY",
  };
  return map[u] ?? null;
}

/** Applicable-tax hints by persona + Solopreneur registration (Ltd vs individual path). */
export function resolveApplicableTaxFlags(
  persona: TaxPersonaCode | null,
  solopreneurRegistration: SolopreneurRegistrationCode | null,
): ApplicableTaxFlags {
  if (!persona) {
    return {
      vat: true,
      pit: true,
      wht: true,
      paye: false,
      cit: true,
      localGovLevies: false,
    };
  }

  if (persona === "SOLOPRENEUR") {
    const reg = solopreneurRegistration ?? "NOT_REGISTERED";
    if (reg === "LIMITED_COMPANY") {
      return {
        vat: true,
        pit: false,
        wht: true,
        paye: false,
        cit: true,
        localGovLevies: false,
      };
    }
    return {
      vat: true,
      pit: true,
      wht: true,
      paye: false,
      cit: false,
      localGovLevies: false,
    };
  }

  if (persona === "TRADER") {
    return {
      vat: true,
      pit: true,
      wht: false,
      paye: false,
      cit: false,
      localGovLevies: true,
    };
  }

  if (persona === "PAYEE") {
    return {
      vat: true,
      pit: true,
      wht: true,
      paye: true,
      cit: false,
      localGovLevies: false,
    };
  }

  if (persona === "GIG_WORKER") {
    return {
      vat: true,
      pit: true,
      wht: true,
      paye: false,
      cit: false,
      localGovLevies: false,
    };
  }

  return {
    vat: true,
    pit: true,
    wht: true,
    paye: false,
    cit: false,
    localGovLevies: false,
  };
}

export type TaxGuidanceLine = {
  code: keyof ApplicableTaxFlags;
  label: string;
  subtitle: string;
  applicable: boolean;
};

const GUIDANCE_ORDER: (keyof ApplicableTaxFlags)[] = [
  "vat",
  "pit",
  "paye",
  "wht",
  "cit",
  "localGovLevies",
];

export function buildTaxGuidanceLines(
  flags: ApplicableTaxFlags,
): TaxGuidanceLine[] {
  return GUIDANCE_ORDER.map((code) => ({
    code,
    label: TAX_GUIDANCE_SUBTITLE[code].label,
    subtitle: TAX_GUIDANCE_SUBTITLE[code].subtitle,
    applicable: flags[code],
  }));
}

function sectionsFour(s: {
  vat: TaxSectionPresentation;
  wht: TaxSectionPresentation;
  cit: TaxSectionPresentation;
  personalIncomeTax: TaxSectionPresentation;
}): TaxpayerComputationContext["sections"] {
  return s;
}

/** Structured computation UI context when user chose a tax persona (overrides keyword blob). */
export function buildComputationContextFromTaxPersona(
  persona: TaxPersonaCode | null,
  solopreneurRegistration: SolopreneurRegistrationCode | null,
): TaxpayerComputationContext | null {
  if (!persona) return null;

  if (persona === "SOLOPRENEUR") {
    const reg = solopreneurRegistration ?? "NOT_REGISTERED";
    const isLtd = reg === "LIMITED_COMPANY";
    const profileCode: TaxpayerComputationProfileCode = "solopreneur";
    const profileLabel =
      reg === "LIMITED_COMPANY"
        ? "Solopreneur (Ltd)"
        : reg === "BUSINESS_NAME"
          ? "Solopreneur (Business Name)"
          : "Solopreneur (unregistered)";
    const classificationHint = isLtd
      ? "Ltd path: focus on CIT on company profits plus VAT/WHT as applicable."
      : "Individual/BN path: focus on PIT self-assessment plus VAT/WHT when thresholds apply.";
    return {
      profileCode,
      profileLabel,
      classificationHint,
      sections: sectionsFour({
        vat: {
          label: "VAT",
          relevance: "primary",
          note: "If not exempt and turnover crosses thresholds, register and charge VAT.",
        },
        wht: {
          label: "WHT",
          relevance: "primary",
          note: "May apply as recipient or deductor on qualifying payments.",
        },
        cit: {
          label: "CIT",
          relevance: isLtd ? "primary" : "typically_not_you",
          note: isLtd
            ? "Company profits are taxed under CIT."
            : "Usually not your main filing if you operate as individual/BN — use PIT instead.",
        },
        personalIncomeTax: {
          label: "Personal Income Tax",
          relevance: isLtd ? "secondary" : "primary",
          note: isLtd
            ? "Directors/partners may still have separate PIT considerations."
            : "Self-assessment on your income (presumptive or normal regime as applicable).",
        },
      }),
    };
  }

  if (persona === "TRADER") {
    return {
      profileCode: "trader",
      profileLabel: "Trader",
      classificationHint:
        "Retail-focused; PIT often presumptive/informal; watch VAT if registered or above threshold; local levies common.",
      sections: sectionsFour({
        vat: {
          label: "VAT",
          relevance: "secondary",
          note: "Applies if registered or turnover exceeds threshold.",
        },
        wht: {
          label: "WHT",
          relevance: "often_small",
          note: "Less common on everyday retail; may arise on specific contracts.",
        },
        cit: {
          label: "CIT",
          relevance: "typically_not_you",
          note: "Unless trading through a limited company.",
        },
        personalIncomeTax: {
          label: "Personal Income Tax",
          relevance: "primary",
          note: "Often presumptive or informal regimes for market traders — confirm with your state IRS.",
        },
      }),
    };
  }

  if (persona === "PAYEE") {
    return {
      profileCode: "payee_side_income",
      profileLabel: "Employee + side income",
      classificationHint:
        "PAYE on salary via employer; PIT may still apply to side income; VAT if side activity qualifies.",
      sections: sectionsFour({
        vat: {
          label: "VAT",
          relevance: "often_small",
          note: "If your side business crosses VAT rules.",
        },
        wht: {
          label: "WHT",
          relevance: "secondary",
          note: "Common on freelance/service invoices.",
        },
        cit: {
          label: "CIT",
          relevance: "typically_not_you",
          note: "Unless side income runs through a company.",
        },
        personalIncomeTax: {
          label: "PIT / PAYE context",
          relevance: "primary",
          note: "Employer handles PAYE on salary; file for other taxable income as required.",
        },
      }),
    };
  }

  if (persona === "GIG_WORKER") {
    return {
      profileCode: "gig_freelancer",
      profileLabel: "Gig worker",
      classificationHint:
        "Variable income; WHT at source is common; PIT self-assessment; VAT if provider rules bite.",
      sections: sectionsFour({
        vat: {
          label: "VAT",
          relevance: "secondary",
          note: "If operating as a VAT-registered service provider above threshold.",
        },
        wht: {
          label: "WHT",
          relevance: "primary",
          note: "Often deducted at source on platform or client payments.",
        },
        cit: {
          label: "CIT",
          relevance: "often_small",
          note: "If you use a limited company structure.",
        },
        personalIncomeTax: {
          label: "Personal Income Tax",
          relevance: "primary",
          note: "Self-assessment on taxable income from gigs.",
        },
      }),
    };
  }

  return {
    profileCode: "remote_worker",
    profileLabel: "Remote worker",
    classificationHint:
      "Foreign-source income may still have Nigerian PIT/WHT/VAT angles depending on residence and contracts.",
    sections: sectionsFour({
      vat: {
        label: "VAT",
        relevance: "often_small",
        note: "If you supply taxable services locally.",
      },
      wht: {
        label: "WHT",
        relevance: "secondary",
        note: "Depends on contract and payer withholding obligations.",
      },
      cit: {
        label: "CIT",
        relevance: "typically_not_you",
        note: "Unless invoicing through a Nigerian limited company.",
      },
      personalIncomeTax: {
        label: "Personal Income Tax",
        relevance: "primary",
        note: "Residency and worldwide income rules may apply — seek adviser for cross-border cases.",
      },
    }),
  };
}

export function buildTaxPersonaGuidancePayload(
  personaRaw: string | null | undefined,
  solopreneurRegRaw: string | null | undefined,
): {
  taxPersona: TaxPersonaCode | null;
  solopreneurRegistration: SolopreneurRegistrationCode | null;
  personaTooltip: string | null;
  applicableTaxes: ApplicableTaxFlags;
  taxes: TaxGuidanceLine[];
} {
  const taxPersona = normalizeTaxPersona(personaRaw);
  const solopreneurRegistration =
    taxPersona === "SOLOPRENEUR"
      ? normalizeSolopreneurRegistration(solopreneurRegRaw)
      : null;
  const applicableTaxes = resolveApplicableTaxFlags(
    taxPersona,
    solopreneurRegistration,
  );
  return {
    taxPersona,
    solopreneurRegistration,
    personaTooltip: taxPersona
      ? TAX_PERSONA_SELECTION_TOOLTIP[taxPersona]
      : null,
    applicableTaxes,
    taxes: buildTaxGuidanceLines(applicableTaxes),
  };
}

const SOLOPRENEUR_REGISTRATION_LABELS: Record<
  SolopreneurRegistrationCode,
  string
> = {
  NOT_REGISTERED: "Not registered",
  BUSINESS_NAME: "Business Name (BN)",
  LIMITED_COMPANY: "Limited Company (Ltd)",
};

/** API payload for onboarding “Select your profile” UI */
export function listTaxPersonasForOnboarding(): Array<{
  code: TaxPersonaCode;
  tooltip: string;
}> {
  return TAX_PERSONA_CODES.map((code) => ({
    code,
    tooltip: TAX_PERSONA_SELECTION_TOOLTIP[code],
  }));
}

export function listSolopreneurRegistrationsForOnboarding(): Array<{
  code: SolopreneurRegistrationCode;
  label: string;
}> {
  return SOLOPRENEUR_REGISTRATION_CODES.map((code) => ({
    code,
    label: SOLOPRENEUR_REGISTRATION_LABELS[code],
  }));
}
