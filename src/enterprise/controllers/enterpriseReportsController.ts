import { Response } from "express";
import { IRequest } from "../../interfaces/CustomRequest";
import { getParam } from "../utils/paramHelpers";
import {
  sendNotFound,
  sendResult,
  sendServerError,
  sendBadRequest,
} from "../utils/controllerHelpers";
import { parseDateRangeQuery } from "../../utils/dateRangeQuery";
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
  exportAllReportsPdf,
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

export async function exportAllReportsPdfHandler(
  req: IRequest,
  res: Response,
): Promise<void> {
  const linkedUserId = req.linkedUserId!;
  const dr = parseDateRangeQuery(req.query as Record<string, unknown>);
  if (!dr.ok) {
    sendBadRequest(res, dr.message);
    return;
  }
  const reportTypeRaw = req.query.reportType as string | undefined;
  const reportType =
    reportTypeRaw && reportTypeRaw.trim() ? reportTypeRaw.trim() : undefined;
  try {
    const result = await exportAllReportsPdf(linkedUserId, {
      dateRange: dr.range,
      reportType,
    });
    if (!result) {
      sendNotFound(
        res,
        "No report periods to export. Add reports or set dateFrom/dateTo.",
      );
      return;
    }
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.filename.replace(/"/g, "")}"`,
    );
    res.setHeader("Content-Length", String(result.buffer.length));
    res.setHeader("X-Report-Sections", String(result.sectionCount));
    res.status(200).send(result.buffer);
  } catch {
    sendServerError(res, "Failed to export reports PDF");
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
    if (data.kind === "pdf") {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${data.filename.replace(/"/g, "")}"`,
      );
      res.setHeader("Content-Length", String(data.buffer.length));
      res.status(200).send(data.buffer);
      return;
    }
    sendResult(res, "Report download", {
      documentUrl: data.documentUrl,
      format: data.format,
    });
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
  const dr = parseDateRangeQuery(req.query as Record<string, unknown>);
  if (!dr.ok) {
    sendBadRequest(res, dr.message);
    return;
  }
  try {
    const result = await listReports(linkedUserId, {
      page,
      limit,
      reportType,
      dateFrom: dr.range.dateFrom,
      dateTo: dr.range.dateTo,
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
