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
import { upsertMinimalFilingDraft } from "../../services/genericFilingDraftService";
import { submitUnifiedTaxFilingForUser } from "../services/unifiedTaxFilingSubmitService";

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
    const userId = getAuthUserId(req);
    const result = await submitUnifiedTaxFilingForUser(
      userId,
      taxType,
      req.body ?? {},
    );
    if (!result.ok) {
      res
        .status(result.status)
        .json(outJson(false, result.message, null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Filing submitted", { taxType: result.taxType, data: result.data }));
  } catch {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to submit filing", null));
  }
}
