import {
  FILING_PAYMENT_STATUSES,
  FILING_STATUS,
  REPORT_TYPES,
  TAX_FILING_PREVIEW_KIND,
  type TaxFilingPreviewKind,
} from "../constants/filings";
import { filingTaxTypeService } from "../enterprise/services/filingTaxTypeService";

const PERIOD_YEAR = { min: 2020, max: 2030 } as const;

/** Relative paths under `.../enterprise/clients/:clientId/` for tax computation GETs. */
const ENTERPRISE_TAX_COMPUTATION_PATHS: Record<string, string> = {
  VAT: "tax-computation/vat",
  WHT: "tax-computation/wht",
  CIT: "tax-computation/cit",
  PAYE: "tax-computation/paye",
  STAMP_DUTIES: "tax-computation/stamp-duties",
};

function previewKindForTaxCode(code: string): TaxFilingPreviewKind {
  const upper = code.toUpperCase();
  if (upper in TAX_FILING_PREVIEW_KIND) {
    return TAX_FILING_PREVIEW_KIND[
      upper as keyof typeof TAX_FILING_PREVIEW_KIND
    ];
  }
  return "manual";
}

export async function getTaxFilingConstants() {
  const taxTypes = await filingTaxTypeService.listForApi(false);
  const capabilities = taxTypes.map((t) => ({
    code: t.code,
    label: t.label,
    previewKind: previewKindForTaxCode(t.code),
    /** Mobile unified routes: GET/POST /mobile/filings/tax/:taxType/... */
    unifiedPaths: {
      preview: `/mobile/filings/tax/${t.code}/preview`,
      draft: `/mobile/filings/tax/${t.code}/draft`,
      submit: `/mobile/filings/tax/${t.code}/submit`,
    },
  }));

  return {
    taxTypes,
    capabilities,
    paymentStatuses: FILING_PAYMENT_STATUSES.map((value) => ({ value })),
    filingStatuses: [...FILING_STATUS],
    reportTypes: [...REPORT_TYPES],
    periodYear: { ...PERIOD_YEAR },
    periodMonth: { min: 1, max: 12 },
    enterpriseTaxComputationPaths: { ...ENTERPRISE_TAX_COMPUTATION_PATHS },
    notes: {
      previewQuery:
        "Use query period=YYYY-M or periodYear + periodMonth (1–12). WHT preview accepts optional whtType.",
      whtSubmitAmount:
        "For WHT, submit body field amount is total WHT due (same as enterprise POST .../filings with taxType WHT).",
    },
  };
}
