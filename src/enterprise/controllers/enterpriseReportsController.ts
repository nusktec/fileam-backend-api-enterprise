import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { getParam } from "../utils/paramHelpers";
import {
  sendNotFound,
  sendResult,
  sendServerError,
} from "../utils/controllerHelpers";
import { sendPaginated } from "../../utils/responseHelpers";
import {
  listReports,
  getTaxesSummary,
  getVatPaymentReport,
  getCitComputationReport,
  getWhtReport,
  getTaxWithholdingReport,
  getPayeComputationReport,
  getReportDownload,
} from "../services/enterpriseReportsService";

export async function getTaxesSummaryHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const data = await getTaxesSummary(linkedUserId);
    sendResult(res, "Taxes summary", data);
  } catch {
    sendServerError(res, "Failed to get taxes summary");
  }
}

export async function getVatPaymentReportHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const data = await getVatPaymentReport(linkedUserId);
    sendResult(res, "VAT payment report", data);
  } catch {
    sendServerError(res, "Failed to get VAT payment report");
  }
}

export async function getCitComputationReportHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const data = await getCitComputationReport(linkedUserId);
    sendResult(res, "CIT computation report", data);
  } catch {
    sendServerError(res, "Failed to get CIT computation report");
  }
}

export async function getWhtReportHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const data = await getWhtReport(linkedUserId);
    sendResult(res, "WHT report", data);
  } catch {
    sendServerError(res, "Failed to get WHT report");
  }
}

export async function getTaxWithholdingReportHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const data = await getTaxWithholdingReport(linkedUserId);
    sendResult(res, "Tax withholding report", data);
  } catch {
    sendServerError(res, "Failed to get tax withholding report");
  }
}

export async function getPayeComputationReportHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  try {
    const data = await getPayeComputationReport(linkedUserId);
    sendResult(res, "PAYE computation report", data);
  } catch {
    sendServerError(res, "Failed to get PAYE computation report");
  }
}

export async function getReportDownloadHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const reportId = getParam(req.params, "reportId");
  try {
    const data = await getReportDownload(linkedUserId, reportId);
    if (!data) {
      sendNotFound(res, "Report not found or no document available");
      return;
    }
    sendResult(res, "Report download", data);
  } catch {
    sendServerError(res, "Failed to get report download");
  }
}

export async function listReportsHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const page = req.query.page ? Number(req.query.page) : 1;
  const limit = req.query.limit ? Number(req.query.limit) : 20;
  const reportType = req.query.reportType as string | undefined;
  try {
    const result = await listReports(linkedUserId, {
      page,
      limit,
      reportType,
    });
    sendPaginated(
      res,
      "Reports",
      result.data,
      result.total,
      result.page,
      result.limit,
    );
  } catch {
    sendServerError(res, "Failed to list reports");
  }
}
