/**
 * Maps onboarding / profile text into which tax computations are emphasized for UI.
 * This does not replace compliance rules — it informs presentation (PIT vs CIT, gig vs SME, etc.).
 */
import {
  buildComputationContextFromTaxPersona,
  normalizeSolopreneurRegistration,
  normalizeTaxPersona,
} from "./taxPersona";

export type TaxpayerComputationProfileCode =
  | "unspecified"
  | "gig_freelancer"
  | "solopreneur"
  | "personal_income_focus"
  | "sme_business"
  | "trader"
  | "payee_side_income"
  | "remote_worker";

export type TaxSectionRelevance =
  | "primary"
  | "secondary"
  | "often_small"
  | "typically_not_you";

export type TaxSectionPresentation = {
  /**
   * Stable card title for UI (e.g. "PIT" when personal income is primary;
   * contrast with CIT estimates elsewhere in the payload).
   */
  label: string;
  relevance: TaxSectionRelevance;
  /** Consumer-facing rationale (short). */
  note?: string;
};

export type TaxpayerComputationContext = {
  profileCode: TaxpayerComputationProfileCode;
  profileLabel: string;
  classificationHint: string;
  sections: {
    vat: TaxSectionPresentation;
    wht: TaxSectionPresentation;
    cit: TaxSectionPresentation;
    /** Progressive personal income framing (distinct from corporate CIT in the app estimates). */
    personalIncomeTax: TaxSectionPresentation;
  };
};

function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

/** Merge user + business onboarding strings into one blob for keyword rules. */
function profileSourceText(parts: {
  roleDescription?: string | null;
  purpose?: string | null;
  businessType?: string | null;
  incomeType?: string | null;
  organizationName?: string | null;
}): string {
  return norm(
    [parts.roleDescription, parts.purpose, parts.businessType, parts.incomeType, parts.organizationName]
      .filter(Boolean)
      .join(" "),
  );
}

export function resolveTaxpayerComputationContext(parts: {
  roleDescription?: string | null;
  purpose?: string | null;
  businessType?: string | null;
  incomeType?: string | null;
  organizationName?: string | null;
  taxPersona?: string | null;
  solopreneurRegistration?: string | null;
}): TaxpayerComputationContext {
  const p = normalizeTaxPersona(parts.taxPersona);
  const reg = normalizeSolopreneurRegistration(parts.solopreneurRegistration);
  const fromPersona = buildComputationContextFromTaxPersona(p, reg);
  if (fromPersona) return fromPersona;

  const blob = profileSourceText(parts);

  /** Personal-income / PAYE-heavy framing (often salaried or PIT wording). */
  if (
    blob.includes("pit") ||
    blob.includes("personal income") ||
    blob.includes("salary-only") ||
    blob.includes("only salary") ||
    blob.includes("employment income") ||
    /\bSalary earner\b/i.test(blob) ||
    /\bpee tee\b/i.test(blob)
  ) {
    return {
      profileCode: "personal_income_focus",
      profileLabel: "Personal income / PIT leaning",
      classificationHint:
        "Profile wording suggests PAYE/NRS PIT framing; VAT/CIT as business-owner may matter less.",
      sections: {
        vat: {
          label: "VAT (output vs input)",
          relevance: "often_small",
          note: "If you only earn salary/withholding, VAT may not apply.",
        },
        wht: {
          label: "WHT (withholding on services)",
          relevance: "secondary",
          note: "WHT on invoices often matters mostly for freelancers and contracts.",
        },
        cit: {
          label: "CIT (company profits — not salary PIT)",
          relevance: "typically_not_you",
          note: "CIT here estimates company profits; unrelated to PAYE withheld on salary.",
        },
        personalIncomeTax: {
          label: "PIT",
          relevance: "primary",
          note: "Progressive Personal Income Tax (often via PAYE/NRS schedules) on taxable personal income—not corporate CIT figures below.",
        },
      },
    };
  }

  if (
    blob.includes("gig") ||
    blob.includes("freelance") ||
    blob.includes("platform") ||
    blob.includes("ride") ||
    blob.includes("driver")
  ) {
    return {
      profileCode: "gig_freelancer",
      profileLabel: "Gig / freelance",
      classificationHint:
        "Emphasises service income & WHT; CIT/VAT thresholds still shown for completeness.",
      sections: {
        vat: {
          label: "VAT (output vs input)",
          relevance: "secondary",
          note: "VAT if you breach threshold or voluntarily register.",
        },
        wht: {
          label: "WHT (withholding on services)",
          relevance: "primary",
          note: "WHT on taxable services/invoices often applies before you pay VAT.",
        },
        cit: {
          label: "CIT (company income tax)",
          relevance: "secondary",
          note: "Small-business CIT when annualised profit passes small-company thresholds.",
        },
        personalIncomeTax: {
          label: "PIT (personal income)",
          relevance: "secondary",
          note: "PIT on net income may still apply in addition to WHT withheld.",
        },
      },
    };
  }

  if (
    blob.includes("solo") ||
    blob.includes("sole prop") ||
    blob.includes("sole trader") ||
    blob.includes("sole proprietor") ||
    blob.includes("solopreneur") ||
    blob.includes("one-person")
  ) {
    return {
      profileCode: "solopreneur",
      profileLabel: "Solopreneur / sole proprietor",
      classificationHint: "Treats you as operating a small business entity for VAT/WHT/CIT estimates.",
      sections: {
        vat: {
          label: "VAT (output vs input)",
          relevance: "primary",
          note: "Monitor turnover vs VAT registration thresholds.",
        },
        wht: {
          label: "WHT (withholding on services)",
          relevance: "primary",
          note: "WHT often applies on invoiced/professional services.",
        },
        cit: {
          label: "CIT (company income tax)",
          relevance: "primary",
          note: "CIT relates to taxable profit once you are in charge of company books.",
        },
        personalIncomeTax: {
          label: "PIT vs business income",
          relevance: "often_small",
          note: "As a sole proprietor, personal vs business filings may overlap — confirm with adviser.",
        },
      },
    };
  }

  if (
    blob.includes("sme") ||
    blob.includes("limited") ||
    blob.includes("ltd") ||
    blob.includes("company") ||
    blob.includes("corporate") ||
    blob.includes("scale")
  ) {
    return {
      profileCode: "sme_business",
      profileLabel: "SME / company operations",
      classificationHint: "Full VAT/WHT/CIT/PAYE view as commonly relevant to trading businesses.",
      sections: {
        vat: { label: "VAT (output vs input)", relevance: "primary" },
        wht: { label: "WHT (withholding on services)", relevance: "primary" },
        cit: { label: "CIT (company income tax)", relevance: "primary" },
        personalIncomeTax: {
          label: "PIT (directors & partners)",
          relevance: "often_small",
          note: "PIT affects directors/partnerships separately from corporate CIT.",
        },
      },
    };
  }

  return {
    profileCode: "unspecified",
    profileLabel: "Tax profile not set",
    classificationHint:
      "Finish onboarding profile (role / business type). All estimates shown for completeness.",
    sections: {
      vat: {
        label: "VAT (output vs input)",
        relevance: "primary",
        note: "Default: treat as small business taxpayer.",
      },
      wht: { label: "WHT (withholding on services)", relevance: "secondary" },
      cit: { label: "CIT (company income tax)", relevance: "secondary" },
      personalIncomeTax: {
        label: "PIT (personal income)",
        relevance: "often_small",
        note: "Depends on salary vs business income sources.",
      },
    },
  };
}
