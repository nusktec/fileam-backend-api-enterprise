import { Response } from "express";
import { outJson } from "../../utils/renders";
import { HttpStatusCode } from "../../interfaces/system";
import { IRequest } from "../../interfaces/CustomRequest";
import { getAuthUserId } from "../../utils/authHelpers";
import { reportsService } from "../services/reportsService";

export const listReports = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const reportType = req.query.reportType as string | undefined;
    const pagination = req.pagination;
    const data = await reportsService.list(
      userId,
      { reportType },
      {
        page: pagination?.page,
        limit: pagination?.limit,
        sortOrder: pagination?.sortOrder,
      },
    );
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Reports retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve reports", null));
  }
};

export const getReportById = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const data = await reportsService.getById(userId, id!);
    if (!data) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Report not found", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Report retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to retrieve report", null));
  }
};

export const getReportTypes = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const data = reportsService.getReportTypes();
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Report types retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get report types", null));
  }
};

export const getReportPeriods = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const reportType = req.query.reportType as string | undefined;
    const data = await reportsService.getPeriods(userId, reportType);
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Periods retrieved", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get periods", null));
  }
};

export const generateReport = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const { reportType, periodYear, periodMonth, format } = req.body ?? {};
    if (!reportType || periodYear == null || periodMonth == null) {
      res
        .status(HttpStatusCode.BAD_REQUEST)
        .json(
          outJson(
            false,
            "reportType, periodYear and periodMonth required",
            null,
          ),
        );
      return;
    }
    const data = await reportsService.generate(userId, {
      reportType: String(reportType),
      periodYear: Number(periodYear),
      periodMonth: Number(periodMonth),
      format: format ? String(format) : undefined,
    });
    res.status(HttpStatusCode.OK).json(outJson(true, "Report generated", data));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to generate report", null));
  }
};

export const getReportDownload = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const url = await reportsService.getDownloadUrl(userId, id!);
    if (!url) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Download not available for this report", null));
      return;
    }
    res.status(HttpStatusCode.OK).json(outJson(true, "Download URL", { url }));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get download", null));
  }
};

export const getReportVaultLink = async (
  req: IRequest,
  res: Response,
): Promise<void> => {
  try {
    const userId = getAuthUserId(req);
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const evidenceVaultId = await reportsService.getVaultLink(userId, id!);
    if (!evidenceVaultId) {
      res
        .status(HttpStatusCode.NOT_FOUND)
        .json(outJson(false, "Vault link not found for this report", null));
      return;
    }
    res
      .status(HttpStatusCode.OK)
      .json(outJson(true, "Vault link", { evidenceVaultId }));
  } catch (error) {
    res
      .status(HttpStatusCode.INTERNAL_SERVER_ERROR)
      .json(outJson(false, "Failed to get vault link", null));
  }
};
