import type {
  TaxGptValidationResult,
  WorkspaceTaxType,
} from "../../constants/filingWorkspace";
import { assertRentClaimComplete } from "../../constants/pitFiling";
import type { PitComputationSnapshot } from "../../constants/pitFiling";

const TAXGPT_API_URL = process.env.TAXGPT_API_URL?.trim() || "";
const TAXGPT_TIMEOUT_MS = 30_000;

export async function runTaxGptValidation(params: {
  taxType: WorkspaceTaxType;
  periodYear: number;
  periodMonth: number;
  computation: Record<string, unknown> | null;
  draftInputs: Record<string, unknown> | null;
}): Promise<TaxGptValidationResult> {
  if (TAXGPT_API_URL) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TAXGPT_TIMEOUT_MS);
      const res = await fetch(TAXGPT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        throw new Error(`TaxGPT returned ${res.status}`);
      }
      const data = (await res.json()) as TaxGptValidationResult;
      if (data.validatedAt && data.checks) return data;
    } catch {
      throw new Error("TaxGPT validation failed. Try again shortly.");
    }
  }

  return buildRuleBasedValidation(params);
}

function buildRuleBasedValidation(params: {
  taxType: WorkspaceTaxType;
  computation: Record<string, unknown> | null;
}): TaxGptValidationResult {
  const checks: TaxGptValidationResult["checks"] = [];
  const comp = params.computation ?? {};

  checks.push({
    id: "computation-present",
    label: "Computation snapshot",
    severity: comp && Object.keys(comp).length > 0 ? "pass" : "fail",
    message:
      comp && Object.keys(comp).length > 0
        ? "Frozen computation is available for review."
        : "Confirm computation before running validation.",
  });

  if (params.taxType === "PIT") {
    try {
      assertRentClaimComplete(comp as PitComputationSnapshot);
      checks.push({
        id: "rent-claim",
        label: "Rent relief claim",
        severity: "pass",
        message: "Rent relief fields are complete or not claimed.",
      });
    } catch {
      checks.push({
        id: "rent-claim",
        label: "Rent relief claim",
        severity: "fail",
        message:
          "Landlord name, contact, address and rent period are required to claim rent relief.",
      });
    }
  }

  if (params.taxType === "CIT") {
    const tin = String(comp.tin ?? "").trim();
    const rc = String(comp.rcNumber ?? "").trim();
    checks.push({
      id: "cit-registration",
      label: "RC number and TIN",
      severity: tin && rc ? "pass" : "warn",
      message: tin && rc ? "Registration identifiers present." : "Add RC number and TIN before filing.",
    });
  }

  if (params.taxType === "VAT") {
    checks.push({
      id: "vat-nil",
      label: "Nil return check",
      severity: "pass",
      message: "Nil returns are allowed when there is no activity.",
    });
  }

  const hasFail = checks.some((c) => c.severity === "fail");
  const hasWarn = checks.some((c) => c.severity === "warn");
  const status: TaxGptValidationResult["status"] = hasFail
    ? "fail"
    : hasWarn
      ? "warn"
      : "pass";

  return {
    validatedAt: new Date().toISOString(),
    status,
    summary: hasFail
      ? "Validation found issues to review before filing."
      : hasWarn
        ? "Validation passed with warnings."
        : "Validation passed.",
    checks,
  };
}
