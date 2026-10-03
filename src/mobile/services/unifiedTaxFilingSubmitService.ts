import { filingTaxTypeService } from "../../enterprise/services/filingTaxTypeService";
import { vatFilingService } from "./vatFilingService";
import { whtFilingService } from "./whtFilingService";
import { citFilingService } from "./citFilingService";
import { pitFilingService } from "./pitFilingService";
import { genericTaxFilingService } from "../../services/genericTaxFilingService";

export type UnifiedSubmitBody = {
  periodYear: unknown;
  periodMonth: unknown;
  amount?: unknown;
  totalWht?: unknown;
  dueDate?: unknown;
  paymentStatus?: unknown;
  receiptUrl?: unknown;
  documentUrl?: unknown;
  evidenceVaultId?: unknown;
  stateOfOperation?: unknown;
  vatRegistrationNumber?: unknown;
  submissionReference?: unknown;
  [key: string]: unknown;
};

export async function submitUnifiedTaxFilingForUser(
  userId: string,
  taxTypeUpper: string,
  body: UnifiedSubmitBody,
): Promise<
  | { ok: true; taxType: string; data: unknown }
  | { ok: false; status: number; message: string }
> {
  const taxType = taxTypeUpper.trim().toUpperCase();
  if (!(await filingTaxTypeService.isActiveCode(taxType))) {
    return {
      ok: false,
      status: 400,
      message:
        "Unknown or inactive tax type; use GET /mobile/filings/constants",
    };
  }

  const {
    periodYear,
    periodMonth,
    amount,
    totalWht,
    dueDate,
    paymentStatus,
    receiptUrl,
    documentUrl,
    evidenceVaultId,
    stateOfOperation,
    vatRegistrationNumber,
    submissionReference,
  } = body;

  if (periodYear == null || periodMonth == null) {
    return {
      ok: false,
      status: 400,
      message: "periodYear and periodMonth required",
    };
  }

  const py = Number(periodYear);
  const pm = Number(periodMonth);
  const paid = paymentStatus === "paid" || paymentStatus === "Paid";
  const due = dueDate ? new Date(String(dueDate)) : new Date(py, pm, 21);

  if (taxType === "VAT") {
    let vatAmount = amount == null ? NaN : Number(amount);
    if (!Number.isFinite(vatAmount)) {
      const calc = await vatFilingService.getCalculation(userId, py, pm);
      vatAmount = Number(calc.netVatPayable ?? 0);
    }
    const data = await vatFilingService.submit(userId, {
      periodYear: py,
      periodMonth: pm,
      amount: vatAmount,
      dueDate: due,
      paymentStatus: paid ? "paid" : "not_paid",
      receiptUrl: receiptUrl as string | undefined,
      documentUrl: documentUrl as string | undefined,
      evidenceVaultId: evidenceVaultId as string | undefined,
      stateOfOperation: stateOfOperation as string | undefined,
      vatRegistrationNumber: vatRegistrationNumber as string | undefined,
      submissionReference: submissionReference as string | undefined,
    });
    return { ok: true, taxType, data };
  }

  if (taxType === "WHT") {
    let whtAmount =
      totalWht != null ? Number(totalWht) : amount != null ? Number(amount) : NaN;
    if (!Number.isFinite(whtAmount)) {
      const sched = await whtFilingService.getSchedule(userId, py, pm);
      whtAmount = Number(sched.totalWht ?? 0);
    }
    const data = await whtFilingService.submit(userId, {
      periodYear: py,
      periodMonth: pm,
      totalWht: whtAmount,
      dueDate: due,
      paymentStatus: paid ? "paid" : "not_paid",
      receiptUrl: receiptUrl as string | undefined,
      documentUrl: documentUrl as string | undefined,
      evidenceVaultId: evidenceVaultId as string | undefined,
      submissionReference: submissionReference as string | undefined,
    });
    return { ok: true, taxType, data };
  }

  if (taxType === "CIT") {
    const data = await citFilingService.submit(
      userId,
      body as Record<string, unknown>,
    );
    return { ok: true, taxType, data };
  }

  if (taxType === "PIT") {
    const data = await pitFilingService.submit(
      userId,
      body as Record<string, unknown>,
    );
    return { ok: true, taxType, data };
  }

  if (amount == null) {
    return {
      ok: false,
      status: 400,
      message: "amount is required for this tax type",
    };
  }

  const data = await genericTaxFilingService.submit(userId, taxType, {
    periodYear: py,
    periodMonth: pm,
    amount: Number(amount),
    dueDate: due,
    paymentStatus: paid ? "paid" : "not_paid",
    receiptUrl: receiptUrl as string | undefined,
    documentUrl: documentUrl as string | undefined,
    evidenceVaultId: evidenceVaultId as string | undefined,
    stateOfOperation: stateOfOperation as string | undefined,
    vatRegistrationNumber: vatRegistrationNumber as string | undefined,
  });
  return { ok: true, taxType, data };
}
