import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { HttpReplyError } from "../../utils/httpReplyError";
import { payrollService } from "../services/payrollService";
import {
  OBLIGATION_TYPE,
  type ObligationType,
} from "../../constants/payrollObligations";

function replyPayrollError(res: Response, error: unknown): boolean {
  if (error instanceof HttpReplyError) {
    res.status(error.statusCode).json(outJson(false, error.message, null));
    return true;
  }
  return false;
}

function periodParam(req: IRequest): string {
  const p = Array.isArray(req.params.period)
    ? req.params.period[0]
    : req.params.period;
  return String(p ?? "");
}

function queryPeriod(req: IRequest): string | undefined {
  const q = req.query.period;
  if (q == null) return undefined;
  return Array.isArray(q) ? String(q[0]) : String(q);
}

export const getPayrollSummary = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await payrollService.getSummary(userId, queryPeriod(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Payroll summary retrieved successfully.", data));
  } catch (error) {
    if (replyPayrollError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve payroll summary", null));
  }
};

export const downloadPayrollAnnualReport = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const result = await payrollService.generateAnnualReportPdf(
      userId,
      queryPeriod(req),
    );
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader("Content-Length", result.buffer.length);
    res.status(HttpStatusCode.OK).send(result.buffer);
  } catch (error) {
    if (replyPayrollError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to generate annual report", null));
  }
};

export const getPayeeDetail = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await payrollService.getPayee(userId, queryPeriod(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "PAYE detail retrieved successfully.", data));
  } catch (error) {
    if (replyPayrollError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve PAYE detail", null));
  }
};

export const getNhfDetail = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await payrollService.getNhf(userId, queryPeriod(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "NHF detail retrieved successfully.", data));
  } catch (error) {
    if (replyPayrollError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve NHF detail", null));
  }
};

export const patchNhfApplicability = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const isNhfApplicable = Boolean(req.body?.isNhfApplicable);
    const data = await payrollService.setNhfApplicability(
      userId,
      isNhfApplicable,
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "NHF applicability updated", data));
  } catch (error) {
    if (replyPayrollError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to update NHF applicability", null));
  }
};

export const getPensionDetail = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const data = await payrollService.getPension(userId, queryPeriod(req));
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Pension detail retrieved successfully.", data));
  } catch (error) {
    if (replyPayrollError(res, error)) return;
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve pension detail", null));
  }
};

function makeActionHandlers(type: ObligationType) {
  return {
    uploadEvidence: async (req: IRequest, res: Response): Promise<void> => {
      try {
        const userId = getAuthUserId(req);
        const data = await payrollService.uploadEvidence(
          userId,
          type,
          periodParam(req),
          {
            url: String(req.body?.url ?? ""),
            evidenceType: String(req.body?.evidenceType ?? ""),
          },
        );
        res
          .status(HttpStatusCode.OK)
          .json(outJson(true, "Evidence uploaded successfully.", data));
      } catch (error) {
        if (replyPayrollError(res, error)) return;
        res
          .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
          .json(outJson(false, "Failed to upload evidence", null));
      }
    },
    assignConsultant: async (req: IRequest, res: Response): Promise<void> => {
      try {
        const userId = getAuthUserId(req);
        const data = await payrollService.assignConsultant(
          userId,
          type,
          periodParam(req),
          String(req.body?.consultantId ?? ""),
        );
        res
          .status(HttpStatusCode.OK)
          .json(outJson(true, "Consultant assigned successfully.", data));
      } catch (error) {
        if (replyPayrollError(res, error)) return;
        res
          .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
          .json(outJson(false, "Failed to assign consultant", null));
      }
    },
    markAsPaid: async (req: IRequest, res: Response): Promise<void> => {
      try {
        const userId = getAuthUserId(req);
        const data = await payrollService.markAsPaid(
          userId,
          type,
          periodParam(req),
        );
        res
          .status(HttpStatusCode.OK)
          .json(outJson(true, "Obligation marked as paid.", data));
      } catch (error) {
        if (replyPayrollError(res, error)) return;
        res
          .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
          .json(outJson(false, "Failed to mark as paid", null));
      }
    },
    pay: async (req: IRequest, res: Response): Promise<void> => {
      try {
        const userId = getAuthUserId(req);
        const data = await payrollService.pay(userId, type, periodParam(req));
        res
          .status(HttpStatusCode.OK)
          .json(outJson(true, "Payment link generated successfully.", data));
      } catch (error) {
        if (replyPayrollError(res, error)) return;
        res
          .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
          .json(outJson(false, "Failed to generate payment link", null));
      }
    },
  };
}

export const payeeActions = makeActionHandlers(OBLIGATION_TYPE.PAYE);
export const nhfActions = makeActionHandlers(OBLIGATION_TYPE.NHF);
export const pensionActions = makeActionHandlers(OBLIGATION_TYPE.PENSION);
