import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import {
  defaultFilingDueDateAfterPeriod,
  parseFilingPeriodFromQuery,
} from "../../utils/filingPeriodQuery";
import { filingTaxTypeService } from "../../enterprise/services/filingTaxTypeService";
import { vatFilingService } from "../services/vatFilingService";
import { whtFilingService } from "../services/whtFilingService";
import { genericTaxFilingService } from "../../services/genericTaxFilingService";
import { upsertMinimalFilingDraft } from "../../services/genericFilingDraftService";

function paramToString(v: string | string[] | undefined): string {
  if (v == null) return "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

function normalizeTaxType(raw: string | string[] | undefined): string {
  return paramToString(raw).trim().toUpperCase();
}

export async function getUnifiedTaxFilingPreview(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const taxType = normalizeTaxType(req.params.taxType);
    if (!(await filingTaxTypeService.isActiveCode(taxType))) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(
            false,
            "Unknown or inactive tax type; use GET /mobile/filings/constants",
            null,
          ),
        );
      return;
    }
    const parsed = parseFilingPeriodFromQuery(
      req.query as Record<string, unknown>,
    );
    if (!parsed) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(
            false,
            "Query period (e.g. 2026-1) or year and month required",
            null,
          ),
        );
      return;
    }
    const userId = getAuthUserId(req);

    if (taxType === "VAT") {
      const data = await vatFilingService.getCalculation(
        userId,
        parsed.year,
        parsed.month,
      );
      res
        .status(HttpStatusCode.OK)
        .json(
          outJson(true, "Filing preview", {
            taxType,
            previewKind: "calculation",
            periodYear: parsed.year,
            periodMonth: parsed.month,
            data,
          }),
        );
      return;
    }

    if (taxType === "WHT") {
      const whtType = req.query.whtType as string | undefined;
      const data = await whtFilingService.getSchedule(
        userId,
        parsed.year,
        parsed.month,
        whtType,
      );
      res
        .status(HttpStatusCode.OK)
        .json(
          outJson(true, "Filing preview", {
            taxType,
            previewKind: "schedule",
            periodYear: parsed.year,
            periodMonth: parsed.month,
            data,
          }),
        );
      return;
    }

    const dueDate = defaultFilingDueDateAfterPeriod(parsed.year, parsed.month);
    res.status(HttpStatusCode.OK).json(
      outJson(true, "Filing preview", {
        taxType,
        previewKind: "manual",
        periodYear: parsed.year,
        periodMonth: parsed.month,
        data: {
          dueDate,
          message:
            "No automated calculation for this tax type. Enter amount when submitting.",
        },
      }),
    );
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get filing preview", null));
  }
}

export async function saveUnifiedTaxFilingDraft(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const taxType = normalizeTaxType(req.params.taxType);
    if (!(await filingTaxTypeService.isActiveCode(taxType))) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(
            false,
            "Unknown or inactive tax type; use GET /mobile/filings/constants",
            null,
          ),
        );
      return;
    }
    const userId = getAuthUserId(req);
    const body = req.body ?? {};
    const { periodYear, periodMonth } = body;
    if (periodYear == null || periodMonth == null) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "periodYear and periodMonth required", null));
      return;
    }
    const py = Number(periodYear);
    const pm = Number(periodMonth);

    if (taxType === "VAT") {
      const data = await vatFilingService.createOrUpdateDraft(userId, {
        periodYear: py,
        periodMonth: pm,
        stateOfOperation: body.stateOfOperation,
        vatRegistrationNumber: body.vatRegistrationNumber,
      });
      res
        .status(HttpStatusCode.OK)
        .json(outJson(true, "Draft saved", { taxType, data }));
      return;
    }

    if (taxType === "WHT") {
      const data = await whtFilingService.createOrUpdateDraft(userId, {
        periodYear: py,
        periodMonth: pm,
        whtType: body.whtType,
        lines: Array.isArray(body.lines) ? body.lines : [],
      });
      res
        .status(HttpStatusCode.OK)
        .json(outJson(true, "Draft saved", { taxType, data }));
      return;
    }

    const data = await upsertMinimalFilingDraft(userId, taxType, py, pm);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Draft saved", { taxType, data }));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to save draft", null));
  }
}

export async function submitUnifiedTaxFiling(
  req: IRequest,
  res: Response,
): Promise<void> {
  try {
    const taxType = normalizeTaxType(req.params.taxType);
    if (!(await filingTaxTypeService.isActiveCode(taxType))) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(
            false,
            "Unknown or inactive tax type; use GET /mobile/filings/constants",
            null,
          ),
        );
      return;
    }
    const userId = getAuthUserId(req);
    const body = req.body ?? {};
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
    } = body;

    if (periodYear == null || periodMonth == null) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "periodYear and periodMonth required", null));
      return;
    }

    const py = Number(periodYear);
    const pm = Number(periodMonth);
    const paid = paymentStatus === "paid" || paymentStatus === "Paid";
    const due = dueDate
      ? new Date(dueDate)
      : new Date(py, pm, 21);

    if (taxType === "VAT") {
      if (amount == null) {
        res
          .status(HttpStatusCode.BAD_REQUEST)
          .json(outJson(false, "amount is required for VAT", null));
        return;
      }
      const data = await vatFilingService.submit(userId, {
        periodYear: py,
        periodMonth: pm,
        amount: Number(amount),
        dueDate: due,
        paymentStatus: paid ? "paid" : "not_paid",
        receiptUrl,
        documentUrl,
        evidenceVaultId,
        stateOfOperation,
        vatRegistrationNumber,
      });
      res
        .status(HttpStatusCode.OK)
        .json(outJson(true, "Filing submitted", { taxType, data }));
      return;
    }

    if (taxType === "WHT") {
      const whtAmount =
        totalWht != null ? Number(totalWht) : amount != null ? Number(amount) : NaN;
      if (Number.isNaN(whtAmount)) {
        res
          .status(HttpStatusCode.BAD_REQUEST)
          .json(
            outJson(
              false,
              "totalWht or amount is required for WHT (total WHT due)",
              null,
            ),
          );
        return;
      }
      const data = await whtFilingService.submit(userId, {
        periodYear: py,
        periodMonth: pm,
        totalWht: whtAmount,
        dueDate: due,
        paymentStatus: paid ? "paid" : "not_paid",
        receiptUrl,
        documentUrl,
        evidenceVaultId,
      });
      res
        .status(HttpStatusCode.OK)
        .json(outJson(true, "Filing submitted", { taxType, data }));
      return;
    }

    if (amount == null) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(outJson(false, "amount is required for this tax type", null));
      return;
    }

    const data = await genericTaxFilingService.submit(userId, taxType, {
      periodYear: py,
      periodMonth: pm,
      amount: Number(amount),
      dueDate: due,
      paymentStatus: paid ? "paid" : "not_paid",
      receiptUrl,
      documentUrl,
      evidenceVaultId,
      stateOfOperation,
      vatRegistrationNumber,
    });
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Filing submitted", { taxType, data }));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to submit filing", null));
  }
}
