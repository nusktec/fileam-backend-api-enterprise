import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { HttpReplyError } from "../../utils/httpReplyError";
import { parseLedgerPeriodQuery } from "../../utils/ledgerPeriodQuery";
import { ledgerReportService } from "../services/ledgerReportService";
import { generateLedgerReportPdf } from "../services/ledgerPdfService";

function handleError(res: Response, error: unknown): void {
  if (error instanceof HttpReplyError) {
    res
      .status(error.statusCode)
      .json(outJson(false, error.message, null));
    return;
  }
  res
    .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
    .json(outJson(false, "Ledger request failed", null));
}

export const getLedgerDashboard = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const data = await ledgerReportService.getDashboard(userId);
    res.status(HttpStatusCode.OK).json(outJson(true, "Ledger dashboard retrieved", data));
  } catch (error) {
    handleError(res, error);
  }
};

export const getTrialBalance = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const period = parseLedgerPeriodQuery(req.query);
    const data = await ledgerReportService.getTrialBalance(userId, period);
    res.status(HttpStatusCode.OK).json(outJson(true, "Trial balance retrieved", data));
  } catch (error) {
    handleError(res, error);
  }
};

export const getGeneralLedger = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const period = parseLedgerPeriodQuery(req.query);
    const data = await ledgerReportService.getGeneralLedger(userId, period);
    res.status(HttpStatusCode.OK).json(outJson(true, "General ledger retrieved", data));
  } catch (error) {
    handleError(res, error);
  }
};

export const getTrialBalancePdf = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const period = parseLedgerPeriodQuery(req.query);
    const data = await ledgerReportService.getTrialBalance(userId, period);
    const pdf = await generateLedgerReportPdf("trial-balance", data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="trial-balance-${period.startDate}-${period.endDate}.pdf"`,
    );
    res.status(HttpStatusCode.OK).send(pdf);
  } catch (error) {
    handleError(res, error);
  }
};

export const getGeneralLedgerPdf = async (req: IRequest, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    const period = parseLedgerPeriodQuery(req.query);
    const data = await ledgerReportService.getGeneralLedger(userId, period);
    const pdf = await generateLedgerReportPdf("general-ledger", data);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="general-ledger-${period.startDate}-${period.endDate}.pdf"`,
    );
    res.status(HttpStatusCode.OK).send(pdf);
  } catch (error) {
    handleError(res, error);
  }
};
